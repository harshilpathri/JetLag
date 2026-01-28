"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { QUESTIONS } from "@/lib/rules";
import type { Category } from "@/lib/rules";

type RoomRow = { id: string; code: string; game_size: string };
type RoundRow = { id: string; room_id: string; active_question_id: string | null };

type QuestionRow = {
  id: string;
  round_id: string;
  category: string;
  question_key: string;
  question_text: string;
  status: "PENDING" | "ANSWERED" | string;
  answer_text: string | null;
  created_at: string;
};

export default function SeekPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  // Picker UI
  const [category, setCategory] = useState<Category>("RADAR");
  const filtered = useMemo(
    () => QUESTIONS.filter((q) => q.category === category),
    [category]
  );
  const [selectedKey, setSelectedKey] = useState<string>(() => filtered[0]?.key ?? "");

  // Connection state
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [round, setRound] = useState<RoundRow | null>(null);

  // Active question (what seekers are waiting on)
  const [activeQuestion, setActiveQuestion] = useState<QuestionRow | null>(null);

  // Status UI
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Keep selectedKey valid when category changes
  function onCategoryChange(next: Category) {
    setCategory(next);
    const first = QUESTIONS.find((q) => q.category === next);
    setSelectedKey(first?.key ?? "");
  }

  async function loadRoomAndRound() {
    setStatusMsg("");

    const { data: rooms, error: roomErr } = await supabase
      .from("rooms")
      .select("id,code,game_size")
      .eq("code", code)
      .limit(1);

    if (roomErr) {
      setStatusMsg(`Room load error: ${roomErr.message}`);
      return;
    }
    if (!rooms || rooms.length === 0) {
      setStatusMsg("Room not found. Create it on the home page first.");
      return;
    }
    const r = rooms[0] as RoomRow;
    setRoom(r);

    const { data: rounds, error: roundErr } = await supabase
      .from("rounds")
      .select("id,room_id,active_question_id")
      .eq("room_id", r.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (roundErr) {
      setStatusMsg(`Round load error: ${roundErr.message}`);
      return;
    }
    if (!rounds || rounds.length === 0) {
      setStatusMsg("Round not found. Create a new round from the home page.");
      return;
    }
    const rd = rounds[0] as RoundRow;
    setRound(rd);
  }

  async function loadActiveQuestionById(questionId: string) {
    const { data, error } = await supabase
      .from("questions")
      .select("id,round_id,category,question_key,question_text,status,answer_text,created_at")
      .eq("id", questionId)
      .limit(1);

    if (error) {
      setStatusMsg(`Active question load error: ${error.message}`);
      return;
    }

    if (data && data.length > 0) setActiveQuestion(data[0] as QuestionRow);
    else setActiveQuestion(null);
  }

  // Initial bootstrap
  useEffect(() => {
    if (!code) return;
    loadRoomAndRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // When round is known, if there's an active_question_id, load it
  useEffect(() => {
    if (!round?.active_question_id) return;
    loadActiveQuestionById(round.active_question_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.active_question_id]);

  // Realtime: listen for round updates (active_question_id changes)
  useEffect(() => {
    if (!round?.id) return;

    const roundChannel = supabase
      .channel(`round-${round.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rounds" },
        (payload) => {
          const r = payload.new as any;
          if (r.id !== round.id) return;

          setRound((prev) => (prev ? { ...prev, active_question_id: r.active_question_id } : prev));

          if (r.active_question_id) {
            loadActiveQuestionById(r.active_question_id);
          } else {
            // cleared means no active question
            setActiveQuestion(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roundChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  // Realtime: listen for updates to the active question (answer coming back)
  useEffect(() => {
    if (!activeQuestion?.id) return;

    const qid = activeQuestion.id;

    const qChannel = supabase
      .channel(`question-${qid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "questions" },
        (payload) => {
          const q = payload.new as any;
          if (q.id !== qid) return;

          setActiveQuestion((prev) =>
            prev
              ? {
                  ...prev,
                  status: q.status,
                  answer_text: q.answer_text ?? null,
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(qChannel);
    };
  }, [activeQuestion?.id]);

  async function sendQuestion() {
    setStatusMsg("");

    if (!room || !round) {
      setStatusMsg("Room/round not loaded yet.");
      return;
    }

    // One-at-a-time rule: if there’s already an active question, don’t send a new one
    if (round.active_question_id) {
      setStatusMsg("A question is already pending. Wait for the hider to answer.");
      return;
    }

    const q = QUESTIONS.find((x) => x.key === selectedKey);
    if (!q) {
      setStatusMsg("No question selected.");
      return;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("questions")
      .insert({
        round_id: round.id,
        category: q.category,
        question_key: q.key,
        question_text: q.text,
        status: "PENDING",
      })
      .select("id,round_id,category,question_key,question_text,status,answer_text,created_at")
      .single();

    if (insertErr || !inserted) {
      setStatusMsg(`Insert error: ${insertErr?.message ?? "unknown"}`);
      return;
    }

    // Set the round’s active question id so:
    // - seekers can’t send another
    // - hider can load the current one easily
    const { error: activeErr } = await supabase
      .from("rounds")
      .update({ active_question_id: inserted.id })
      .eq("id", round.id);

    if (activeErr) {
      setStatusMsg(`Question inserted, but failed to set active question: ${activeErr.message}`);
      return;
    }

    // Update local state immediately (don’t rely on realtime)
    setRound((prev) => (prev ? { ...prev, active_question_id: inserted.id } : prev));
    setActiveQuestion(inserted as QuestionRow);
    setStatusMsg("Question sent. Waiting for hider…");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Seekers View</h1>
      <p>
        Room: <b>{code}</b>
        {room ? (
          <>
            {" "}
            • Game size: <b>{room.game_size}</b>
          </>
        ) : null}
      </p>

      {statusMsg ? (
        <pre
          style={{
            marginTop: 12,
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {statusMsg}
        </pre>
      ) : null}

      <section style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
        <h2>Ask a question</h2>

        <div style={{ display: "grid", gap: 12, maxWidth: 560, marginTop: 10 }}>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value as Category)}
              style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}
              disabled={!!round?.active_question_id}
            >
              <option value="MATCHING">Matching</option>
              <option value="MEASURING">Measuring</option>
              <option value="RADAR">Radar</option>
              <option value="THERMO">Thermometer</option>
              <option value="PHOTO">Photo</option>
              <option value="TENTACLE">Tentacle</option>
            </select>
          </label>

          <label>
            Question
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}
              disabled={!!round?.active_question_id}
            >
              {filtered.map((qq) => (
                <option key={qq.key} value={qq.key}>
                  {qq.text}
                </option>
              ))}
            </select>
          </label>

          <button onClick={sendQuestion} style={{ padding: "10px 12px" }} disabled={!!round?.active_question_id}>
            Send to Hider
          </button>

          {round?.active_question_id ? (
            <p style={{ fontSize: 12, opacity: 0.75, margin: 0 }}>
              A question is currently active. Wait for the answer before sending another.
            </p>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
        <h2>Current question</h2>

        {!activeQuestion ? (
          <p>No active question.</p>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Status: <b>{activeQuestion.status}</b>
            </div>

            <div style={{ marginTop: 8, fontSize: 16 }}>{activeQuestion.question_text}</div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Answer</div>
              <div style={{ marginTop: 6 }}>
                {activeQuestion.status === "ANSWERED" ? (
                  <b>{activeQuestion.answer_text ?? "(no answer text)"}</b>
                ) : (
                  <i>Waiting for hider…</i>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
