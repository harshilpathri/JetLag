"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { QUESTIONS } from "@/lib/rules";
import type { Category, GameSize } from "@/lib/rules";
import { Button, Card, Field, Notice, Select } from "@/components/ui";

export const dynamic = "force-dynamic";

type RoomRow = { id: string; code: string; game_size: GameSize };
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

  // Connection state
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [round, setRound] = useState<RoundRow | null>(null);

  // Picker UI
  const [category, setCategory] = useState<Category>("RADAR");
  const [selectedKey, setSelectedKey] = useState<string>("");

  // Active question seekers are waiting on
  const [activeQuestion, setActiveQuestion] = useState<QuestionRow | null>(null);

  // Status UI
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Only lock SEND (dropdowns still usable)
  const locked = activeQuestion?.status === "PENDING";

  const gameSize: GameSize | null = room?.game_size ?? null;

  // 1) Filter questions by room size
  const allowedQuestions = useMemo(() => {
    if (!gameSize) return [];
    return QUESTIONS.filter((q) => q.sizes.includes(gameSize));
  }, [gameSize]);

  // 2) Compute which categories actually have allowed questions (for this size)
  const allowedCategories = useMemo(() => {
    const set = new Set<Category>();
    for (const q of allowedQuestions) set.add(q.category);
    return Array.from(set);
  }, [allowedQuestions]);

  // 3) Filter list for the selected category
  const filtered = useMemo(
    () => allowedQuestions.filter((q) => q.category === category),
    [allowedQuestions, category]
  );

  // Keep category valid if room size changes
  useEffect(() => {
    if (!gameSize) return;

    if (!allowedCategories.includes(category)) {
      const fallback = (allowedCategories.includes("RADAR")
        ? "RADAR"
        : allowedCategories[0]) as Category | undefined;

      setCategory(fallback ?? "RADAR");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSize, allowedCategories.join("|")]);

  // Keep selectedKey valid
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedKey("");
      return;
    }
    if (!filtered.some((q) => q.key === selectedKey)) {
      setSelectedKey(filtered[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, category, gameSize]);

  function onCategoryChange(next: Category) {
    setCategory(next);
    const first = allowedQuestions.find((q) => q.category === next);
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
    setRound(rounds[0] as RoundRow);
  }

  async function loadQuestionById(questionId: string) {
    const { data, error } = await supabase
      .from("questions")
      .select("id,round_id,category,question_key,question_text,status,answer_text,created_at")
      .eq("id", questionId)
      .limit(1);

    if (error) {
      setStatusMsg(`Question load error: ${error.message}`);
      return;
    }

    if (data && data.length > 0) setActiveQuestion(data[0] as QuestionRow);
  }

  // Bootstrap
  useEffect(() => {
    if (!code) return;
    loadRoomAndRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // When round is known, load active question if present
  useEffect(() => {
    if (!round?.active_question_id) return;
    loadQuestionById(round.active_question_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.active_question_id]);

  // Realtime: rounds updates (active_question_id changes)
  useEffect(() => {
    if (!round?.id) return;

    const ch = supabase
      .channel(`seek-round-${round.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rounds" }, (payload) => {
        const r = payload.new as any;
        if (r.id !== round.id) return;

        setRound((prev) => (prev ? { ...prev, active_question_id: r.active_question_id } : prev));

        if (r.active_question_id) loadQuestionById(r.active_question_id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  // Realtime: question updates (answer/status changes)
  useEffect(() => {
    if (!activeQuestion?.id) return;
    const qid = activeQuestion.id;

    const ch = supabase
      .channel(`seek-q-${qid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions" }, (payload) => {
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
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeQuestion?.id]);

  async function sendQuestion() {
    setStatusMsg("");

    if (!room || !round) {
      setStatusMsg("Room/round not loaded yet.");
      return;
    }

    if (locked) {
      setStatusMsg("Waiting for hider to answer the current question.");
      return;
    }

    const q = allowedQuestions.find((x) => x.key === selectedKey);
    if (!q) {
      setStatusMsg("No question selected (or not allowed for this game size).");
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

    const { error: activeErr } = await supabase
      .from("rounds")
      .update({ active_question_id: inserted.id })
      .eq("id", round.id);

    if (activeErr) {
      setStatusMsg(`Question inserted, but failed to set active question: ${activeErr.message}`);
      return;
    }

    setRound((prev) => (prev ? { ...prev, active_question_id: inserted.id } : prev));
    setActiveQuestion(inserted as QuestionRow);
    setStatusMsg("Question sent. Waiting for hider…");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black/5 to-white px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Seekers</h1>
          <p className="mt-2 text-sm text-black/60">
            Room: <span className="font-semibold text-black">{code}</span>
            {room ? (
              <>
                {" "}
                • Game size: <span className="font-semibold text-black">{room.game_size}</span>
              </>
            ) : null}
          </p>
          {statusMsg ? <Notice text={statusMsg} /> : null}
        </header>

        <div className="grid gap-6">
          <Card
            title="Ask a question"
            right={
              <span className={"text-xs font-semibold " + (locked ? "text-black/60" : "text-black/40")}>
                {locked ? "Waiting for hider…" : "Ready"}
              </span>
            }
          >
            {!room ? (
              <p className="text-sm text-black/60">Loading room…</p>
            ) : (
              <div className="grid gap-4">
                <div className="text-xs text-black/60">
                  Showing only questions allowed in{" "}
                  <span className="font-semibold text-black">{room.game_size}</span>.
                </div>

                <Field label="Category">
                  <Select
                    value={category}
                    onChange={(e) => onCategoryChange(e.target.value as Category)}
                    disabled={allowedCategories.length === 0}
                  >
                    {allowedCategories.length === 0 ? (
                      <option value="">(No categories available)</option>
                    ) : (
                      allowedCategories.map((c) => (
                        <option key={c} value={c}>
                          {c === "MATCHING"
                            ? "Matching"
                            : c === "MEASURING"
                            ? "Measuring"
                            : c === "RADAR"
                            ? "Radar"
                            : c === "THERMO"
                            ? "Thermometer"
                            : c === "PHOTO"
                            ? "Photo"
                            : "Tentacle"}
                        </option>
                      ))
                    )}
                  </Select>
                </Field>

                <Field label="Question">
                  <Select
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    disabled={filtered.length === 0}
                  >
                    {filtered.length === 0 ? (
                      <option value="">(No questions in this category for this size)</option>
                    ) : (
                      filtered.map((qq) => (
                        <option key={qq.key} value={qq.key}>
                          {qq.text}
                        </option>
                      ))
                    )}
                  </Select>
                </Field>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={sendQuestion} disabled={locked || !selectedKey}>
                    Send to Hider
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await loadRoomAndRound();
                      if (round?.active_question_id) await loadQuestionById(round.active_question_id);
                      setStatusMsg("Refreshed.");
                    }}
                  >
                    Refresh
                  </Button>
                </div>

                {locked ? (
                  <p className="text-xs text-black/60">
                    You can still browse questions, but you can’t send another until the hider finishes the current one.
                  </p>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="Current question">
            {!activeQuestion ? (
              <p className="text-sm text-black/60">No active question yet.</p>
            ) : (
              <div className="grid gap-3">
                <div className="text-xs text-black/60">
                  Status: <span className="font-semibold text-black">{activeQuestion.status}</span>
                </div>
                <div className="text-base font-semibold">{activeQuestion.question_text}</div>

                <div className="rounded-2xl border border-black/10 bg-black/5 p-4">
                  <div className="text-xs font-semibold text-black/60">Answer</div>
                  <div className="mt-2 text-sm">
                    {activeQuestion.status === "ANSWERED" ? (
                      <span className="font-semibold">{activeQuestion.answer_text ?? "(no answer text)"}</span>
                    ) : (
                      <span className="text-black/60 italic">Waiting for hider…</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
