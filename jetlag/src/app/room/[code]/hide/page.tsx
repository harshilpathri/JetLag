"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDrawKeep, Category } from "@/lib/rules";

type QuestionRow = {
  id: string;
  round_id: string;
  category: Category | string;
  question_key: string;
  question_text: string;
  status: "PENDING" | "ANSWERED" | string;
  answer_text: string | null;
  created_at: string;
};

type RoomRow = { id: string; code: string; game_size: string };
type RoundRow = { id: string; room_id: string; active_question_id: string | null };

type DeckRow = {
  id: string;
  round_id: string;
  draw_pile: string[]; // jsonb array of card ids
  discard_pile: string[];
};

type HiderStateRow = {
  id: string;
  round_id: string;
  hand: string[];
  max_hand_size: number;
};

type PendingDrawRow = {
  id: string;
  question_id: string;
  drawn_cards: string[];
  keep_count: number;
  kept_cards: string[];
  status: "AWAITING_PICK" | "COMPLETE" | string;
};

export default function HidePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  // Resolved ids
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [round, setRound] = useState<RoundRow | null>(null);

  // Game state
  const [latestQuestion, setLatestQuestion] = useState<QuestionRow | null>(null);
  const [answerText, setAnswerText] = useState("");

  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [hiderState, setHiderState] = useState<HiderStateRow | null>(null);

  // Draw UI state
  const [pendingDraw, setPendingDraw] = useState<PendingDrawRow | null>(null);
  const [selectedKeep, setSelectedKeep] = useState<Set<string>>(new Set());

  const [statusMsg, setStatusMsg] = useState<string>("");

  const hasPendingPick = pendingDraw?.status === "AWAITING_PICK";

  const drawKeep = useMemo(() => {
    if (!latestQuestion) return null;
    // category string may not be typed, but our getDrawKeep supports our enum values
    const cat = latestQuestion.category as Category;
    return getDrawKeep(cat);
  }, [latestQuestion]);

  // ---------------------------
  // Helpers: load base entities
  // ---------------------------
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
      setStatusMsg("Room not found. Create a room row with this code in Supabase.");
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
      setStatusMsg("Round not found. Create a round row for this room in Supabase.");
      return;
    }
    const rd = rounds[0] as RoundRow;
    setRound(rd);
  }

  async function loadDeckAndHand(roundId: string) {
    const [{ data: decks, error: deckErr }, { data: hs, error: hsErr }] =
      await Promise.all([
        supabase.from("decks").select("id,round_id,draw_pile,discard_pile").eq("round_id", roundId).limit(1),
        supabase.from("hider_state").select("id,round_id,hand,max_hand_size").eq("round_id", roundId).limit(1),
      ]);

    if (deckErr) setStatusMsg((m) => `${m}\nDeck load error: ${deckErr.message}`);
    if (hsErr) setStatusMsg((m) => `${m}\nHider state load error: ${hsErr.message}`);

    if (decks && decks.length > 0) setDeck(decks[0] as DeckRow);
    if (hs && hs.length > 0) setHiderState(hs[0] as HiderStateRow);
  }

  async function loadLatestQuestion(roundId: string) {
    const { data, error } = await supabase
      .from("questions")
      .select("id,round_id,category,question_key,question_text,status,answer_text,created_at")
      .eq("round_id", roundId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      setStatusMsg(`Question load error: ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      const q = data[0] as QuestionRow;
      setLatestQuestion(q);
      setAnswerText(q.answer_text ?? "");
    } else {
      setLatestQuestion(null);
      setAnswerText("");
    }
  }

  async function loadPendingDraw(questionId: string) {
    const { data, error } = await supabase
      .from("pending_draws")
      .select("id,question_id,drawn_cards,keep_count,kept_cards,status")
      .eq("question_id", questionId)
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      setStatusMsg(`Pending draw load error: ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      const pd = data[0] as PendingDrawRow;
      setPendingDraw(pd);
      setSelectedKeep(new Set(pd.kept_cards ?? []));
    } else {
      setPendingDraw(null);
      setSelectedKeep(new Set());
    }
  }

  // ---------------------------
  // Bootstrap load + realtime
  // ---------------------------
  useEffect(() => {
    if (!code) return;

    (async () => {
      await loadRoomAndRound();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (!round?.id) return;

    (async () => {
      await Promise.all([loadLatestQuestion(round.id), loadDeckAndHand(round.id)]);
    })();

    // Subscribe for new questions and question updates (answers)
    const qChannel = supabase
      .channel(`questions:${round.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        (payload) => {
          const row = payload.new as any;
          // Only care about this round
          if (row?.round_id === round.id) {
            setLatestQuestion((prev) => {
              // Use newest question by created_at; for simplicity just accept latest insert/update
              return row as QuestionRow;
            });
            setAnswerText(row?.answer_text ?? "");
            // After any question change, try loading pending draw for it
            if (row?.id) loadPendingDraw(row.id);
          }
        }
      )
      .subscribe();

    // Subscribe for deck/hand updates
    const stateChannel = supabase
      .channel(`state:${round.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decks" },
        (payload) => {
          const row = payload.new as any;
          if (row?.round_id === round.id) setDeck(row as DeckRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hider_state" },
        (payload) => {
          const row = payload.new as any;
          if (row?.round_id === round.id) setHiderState(row as HiderStateRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_draws" },
        (payload) => {
          const row = payload.new as any;
          // pending_draws doesn't have round_id; filter by current question when possible
          if (latestQuestion?.id && row?.question_id === latestQuestion.id) {
            setPendingDraw(row as PendingDrawRow);
            setSelectedKeep(new Set((row as PendingDrawRow).kept_cards ?? []));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(qChannel);
      supabase.removeChannel(stateChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  useEffect(() => {
    if (!latestQuestion?.id) return;
    loadPendingDraw(latestQuestion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQuestion?.id]);

  // ---------------------------
  // Actions
  // ---------------------------
  async function submitAnswerAndCreateDraw() {
    setStatusMsg("");
    if (!latestQuestion) {
      setStatusMsg("No question to answer.");
      return;
    }
    if (!round?.id) {
      setStatusMsg("Round not loaded.");
      return;
    }
    if (!deck || !hiderState) {
      setStatusMsg("Deck/hand not loaded. Ensure decks and hider_state rows exist for this round.");
      return;
    }

    // Update question to ANSWERED (still counts even if answer is "null"/cannot)
    const { error: qErr } = await supabase
      .from("questions")
      .update({ status: "ANSWERED", answer_text: answerText })
      .eq("id", latestQuestion.id);

    if (qErr) {
      setStatusMsg(`Answer update error: ${qErr.message}`);
      return;
    }

    // If a pending draw already exists and is awaiting pick, don't create a new one
    if (pendingDraw && pendingDraw.status === "AWAITING_PICK") {
      setStatusMsg("Pending draw already exists. Pick your kept cards.");
      return;
    }

    // Determine draw/keep
    const cat = latestQuestion.category as Category;
    const { draw, keep } = getDrawKeep(cat);

    const drawPile = Array.isArray(deck.draw_pile) ? [...deck.draw_pile] : [];
    if (drawPile.length < draw) {
      setStatusMsg("Deck is out of cards. Add more cards to draw_pile in Supabase for now.");
      return;
    }

    const drawnCards = drawPile.slice(0, draw);
    const remaining = drawPile.slice(draw);

    // Update deck piles (discard unchanged at this moment)
    const { error: deckErr } = await supabase
      .from("decks")
      .update({ draw_pile: remaining })
      .eq("id", deck.id);

    if (deckErr) {
      setStatusMsg(`Deck update error: ${deckErr.message}`);
      return;
    }

    // Create pending draw row
    const { data: pdData, error: pdErr } = await supabase
      .from("pending_draws")
      .insert({
        question_id: latestQuestion.id,
        drawn_cards: drawnCards,
        keep_count: keep,
        kept_cards: [],
        status: "AWAITING_PICK",
      })
      .select("id,question_id,drawn_cards,keep_count,kept_cards,status")
      .single();

    if (pdErr) {
      setStatusMsg(`Pending draw create error: ${pdErr.message}`);
      return;
    }

    setPendingDraw(pdData as PendingDrawRow);
    setSelectedKeep(new Set());
    setStatusMsg("Answer recorded. Pick your kept card(s).");
  }

  async function confirmKeepSelection() {
    setStatusMsg("");
    if (!pendingDraw || pendingDraw.status !== "AWAITING_PICK") {
      setStatusMsg("No pending draw to resolve.");
      return;
    }
    if (!hiderState || !deck) {
      setStatusMsg("Deck/hand not loaded.");
      return;
    }

    const keepCount = pendingDraw.keep_count;
    const chosen = Array.from(selectedKeep);

    if (chosen.length !== keepCount) {
      setStatusMsg(`Select exactly ${keepCount} card(s) to keep.`);
      return;
    }

    // Compute discards (drawn - kept)
    const drawn = pendingDraw.drawn_cards ?? [];
    const kept = chosen;
    const discarded = drawn.filter((c) => !kept.includes(c));

    // Update pending_draws row
    const { error: pdErr } = await supabase
      .from("pending_draws")
      .update({ kept_cards: kept, status: "COMPLETE" })
      .eq("id", pendingDraw.id);

    if (pdErr) {
      setStatusMsg(`Pending draw update error: ${pdErr.message}`);
      return;
    }

    // Update hider hand
    const newHand = [...(hiderState.hand ?? []), ...kept];

    // Update deck discard pile (add discarded)
    const newDiscard = [...(deck.discard_pile ?? []), ...discarded];

    const [{ error: hsErr }, { error: deckErr }] = await Promise.all([
      supabase.from("hider_state").update({ hand: newHand }).eq("id", hiderState.id),
      supabase.from("decks").update({ discard_pile: newDiscard }).eq("id", deck.id),
    ]);

    if (hsErr) {
      setStatusMsg(`Hand update error: ${hsErr.message}`);
      return;
    }
    if (deckErr) {
      setStatusMsg(`Discard update error: ${deckErr.message}`);
      return;
    }

    // Enforce max hand size (MVP: force discard extras from the end)
    const max = hiderState.max_hand_size ?? 6;
    if (newHand.length > max) {
      setStatusMsg(
        `Hand is over max (${newHand.length}/${max}). For MVP, discard extras manually in Supabase or extend UI next.`
      );
    } else {
      setStatusMsg("Kept cards added to hand.");
    }

    setPendingDraw(null);
    setSelectedKeep(new Set());
  }

  function toggleKeep(cardId: string) {
    setSelectedKeep((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Hider View</h1>
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
        <h2>Incoming question</h2>

        {!round ? (
          <p>Loading room/round…</p>
        ) : !latestQuestion ? (
          <p>No question yet.</p>
        ) : (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 14,
              marginTop: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Category: <b>{String(latestQuestion.category)}</b> • Status:{" "}
                  <b>{String(latestQuestion.status)}</b>
                </div>
                <div style={{ marginTop: 6, fontSize: 18 }}>{latestQuestion.question_text}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, textAlign: "right" }}>
                {new Date(latestQuestion.created_at).toLocaleString()}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>
                Answer
              </label>
              <input
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type answer here…"
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 8, border: "1px solid #ccc" }}
                disabled={hasPendingPick}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={submitAnswerAndCreateDraw}
                style={{ padding: "10px 12px" }}
                disabled={hasPendingPick || !deck || !hiderState}
                title={
                  hasPendingPick
                    ? "Resolve pending draw first"
                    : !deck || !hiderState
                    ? "Need decks + hider_state rows for this round"
                    : ""
                }
              >
                Submit answer → Draw
              </button>

              <button
                onClick={async () => {
                  if (round?.id) {
                    await Promise.all([loadLatestQuestion(round.id), loadDeckAndHand(round.id)]);
                    if (latestQuestion?.id) await loadPendingDraw(latestQuestion.id);
                    setStatusMsg("Refreshed.");
                  }
                }}
                style={{ padding: "10px 12px" }}
              >
                Refresh
              </button>
            </div>

            {drawKeep ? (
              <p style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                Draw/keep rule for this category: draw <b>{drawKeep.draw}</b>, keep <b>{drawKeep.keep}</b>.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
        <h2>Draw selection</h2>

        {!pendingDraw || pendingDraw.status !== "AWAITING_PICK" ? (
          <p>No pending draw.</p>
        ) : (
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Status: <b>{pendingDraw.status}</b> • Keep: <b>{pendingDraw.keep_count}</b>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              {(pendingDraw.drawn_cards ?? []).map((cardId) => {
                const selected = selectedKeep.has(cardId);
                return (
                  <button
                    key={cardId}
                    onClick={() => toggleKeep(cardId)}
                    disabled={pendingDraw.status !== "AWAITING_PICK"}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: selected ? "2px solid #111" : "1px solid #ccc",
                      background: selected ? "#efefef" : "white",
                      minWidth: 140,
                      textAlign: "left",
                    }}
                    title="Click to toggle keep"
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>CARD</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{cardId}</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                      {selected ? "Selected" : "Not selected"}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={confirmKeepSelection}
                style={{ padding: "10px 12px" }}
                disabled={pendingDraw.status !== "AWAITING_PICK"}
              >
                Confirm keep
              </button>

              <span style={{ fontSize: 12, opacity: 0.75, alignSelf: "center" }}>
                Selected {selectedKeep.size}/{pendingDraw.keep_count}
              </span>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
        <h2>Hand</h2>

        {!hiderState ? (
          <p>No hider state loaded. Ensure `hider_state` row exists for this round.</p>
        ) : (
          <>
            <p style={{ fontSize: 12, opacity: 0.75 }}>
              Cards in hand: <b>{(hiderState.hand ?? []).length}</b> / max{" "}
              <b>{hiderState.max_hand_size}</b>
            </p>

            {(hiderState.hand ?? []).length === 0 ? (
              <p>Hand is empty.</p>
            ) : (
              <ul>
                {hiderState.hand.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
        <h2>Deck (debug)</h2>

        {!deck ? (
          <p>No deck loaded. Ensure `decks` row exists for this round.</p>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            <div>
              Draw pile remaining: <b>{(deck.draw_pile ?? []).length}</b>
            </div>
            <div>
              Discard pile: <b>{(deck.discard_pile ?? []).length}</b>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
