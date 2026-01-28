"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDrawKeep } from "@/lib/rules";
import type { Category } from "@/lib/rules";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { baseType } from "@/lib/deck";

type RoomRow = { id: string; code: string; game_size: string };
type RoundRow = { id: string; room_id: string; active_question_id: string | null };

type QuestionRow = {
  id: string;
  round_id: string;
  category: Category;
  question_key: string;
  question_text: string;
  status: "PENDING" | "ANSWERED" | string;
  answer_text: string | null;
  created_at?: string;
};

type DeckRow = {
  id: string;
  round_id: string;
  draw_pile: string[];
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
  round_id: string;
  question_id: string;
  drawn_cards: string[];
  kept_cards: string[]; // keep NOT NULL semantics (use [] until picked)
  keep_count: number;
  status: "AWAITING_PICK" | "COMPLETE" | string;
  created_at?: string;
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * If draw pile is too small, reshuffle discard pile back into draw pile.
 * Returns updated (drawPile, discardPile), and draws N from the *front* of draw pile.
 */
function drawWithReshuffle(
  drawPile: string[],
  discardPile: string[],
  n: number
): { drawn: string[]; newDraw: string[]; newDiscard: string[] } {
  let dp = [...drawPile];
  let disc = [...discardPile];

  if (dp.length < n && disc.length > 0) {
    dp = dp.concat(shuffle(disc));
    disc = [];
  }

  const drawn = dp.slice(0, n);
  const newDraw = dp.slice(n);
  return { drawn, newDraw, newDiscard: disc };
}

export default function HidePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [statusMsg, setStatusMsg] = useState<string>("");

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [round, setRound] = useState<RoundRow | null>(null);

  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [hiderState, setHiderState] = useState<HiderStateRow | null>(null);

  // Rules modifier (manual toggle; affects draw/keep rewards)
  const [overflowingChalice, setOverflowingChalice] = useState<boolean>(false);

  // Current incoming PENDING question
  const [pendingQuestion, setPendingQuestion] = useState<QuestionRow | null>(null);
  const [answerText, setAnswerText] = useState<string>("");

  // Current pending draw (awaiting pick)
  const [pendingDraw, setPendingDraw] = useState<PendingDrawRow | null>(null);
  const [selectedKeep, setSelectedKeep] = useState<Set<string>>(new Set());

  // Discard selection UI (also used for powerup “discard cost” selection)
  const [selectedDiscard, setSelectedDiscard] = useState<Set<string>>(new Set());

  // Powerup play mode
  const [powerupMode, setPowerupMode] = useState<
    null | "DISCARD_1_DRAW_2" | "DISCARD_2_DRAW_3"
  >(null);

  const awaitingPick = pendingDraw?.status === "AWAITING_PICK";
  const keepNeeded = pendingDraw?.keep_count ?? 0;
  const keepPicked = selectedKeep.size;
  const canConfirmKeep = awaitingPick && keepPicked === keepNeeded;

  const discardReq =
    powerupMode === "DISCARD_1_DRAW_2" ? 1 : powerupMode === "DISCARD_2_DRAW_3" ? 2 : 0;
  const drawGain =
    powerupMode === "DISCARD_1_DRAW_2" ? 2 : powerupMode === "DISCARD_2_DRAW_3" ? 3 : 0;


  const hasDiscard1 = !!hiderState?.hand.some((c) => baseType(c) === "DISCARD_1_DRAW_2");
  const hasDiscard2 = !!hiderState?.hand.some((c) => baseType(c) === "DISCARD_2_DRAW_3");
  const hasExpand = !!hiderState?.hand.some((c) => baseType(c) === "DRAW_1_EXPAND_HAND");

  // Need powerup + enough *other* cards to discard
  const canEnterDiscard1 =
    !!hiderState && !!deck && !awaitingPick && hasDiscard1 && hiderState.hand.length >= 2;
  const canEnterDiscard2 =
    !!hiderState && !!deck && !awaitingPick && hasDiscard2 && hiderState.hand.length >= 3;

  const canPlayExpand =
    !!hiderState && !!deck && !awaitingPick && hasExpand; // no discard cost

  // Normal discard-from-hand (player-managed) is disabled while choosing kept cards OR powerup mode
  const canDiscard =
    !!hiderState && !!deck && selectedDiscard.size > 0 && !awaitingPick && !powerupMode;

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

  async function loadDeckAndHand(roundId: string) {
    const { data: decks, error: deckErr } = await supabase
      .from("decks")
      .select("id,round_id,draw_pile,discard_pile")
      .eq("round_id", roundId)
      .limit(1);

    if (deckErr) {
      setStatusMsg(`Deck load error: ${deckErr.message}`);
      return;
    }
    if (decks && decks.length > 0) setDeck(decks[0] as DeckRow);

    const { data: hs, error: hsErr } = await supabase
      .from("hider_state")
      .select("id,round_id,hand,max_hand_size")
      .eq("round_id", roundId)
      .limit(1);

    if (hsErr) {
      setStatusMsg(`Hand load error: ${hsErr.message}`);
      return;
    }
    if (hs && hs.length > 0) setHiderState(hs[0] as HiderStateRow);
  }

  async function loadPendingQuestion(roundId: string) {
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
      setPendingQuestion(data[0] as QuestionRow);
      setAnswerText("");
    } else {
      setPendingQuestion(null);
      setAnswerText("");
    }
  }

  async function loadPendingDraw(roundId: string) {
    const { data, error } = await supabase
      .from("pending_draws")
      .select("id,round_id,question_id,drawn_cards,kept_cards,keep_count,status,created_at")
      .eq("round_id", roundId)
      .eq("status", "AWAITING_PICK")
      .limit(1);

    if (error) {
      setStatusMsg(`Pending draw load error: ${error.message}`);
      return;
    }

    if (data && data.length > 0) {
      setPendingDraw(data[0] as PendingDrawRow);
      setSelectedKeep(new Set());
    } else {
      setPendingDraw(null);
      setSelectedKeep(new Set());
    }
  }

  // Bootstrap
  useEffect(() => {
    if (!code) return;
    loadRoomAndRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Once round known, load initial state
  useEffect(() => {
    if (!round?.id) return;
    loadDeckAndHand(round.id);
    loadPendingQuestion(round.id);
    loadPendingDraw(round.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  // Realtime: questions (receive new questions instantly)
  useEffect(() => {
    if (!round?.id) return;

    const ch = supabase
      .channel(`hide-questions-${round.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "questions" }, (payload) => {
        const q = payload.new as any;
        if (q.round_id !== round.id) return;
        if (q.status && q.status !== "PENDING") return;

        setPendingQuestion(q as QuestionRow);
        setAnswerText("");
        setStatusMsg("");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions" }, (payload) => {
        const q = payload.new as any;
        if (q.round_id !== round.id) return;

        // If this question gets answered, clear it from the incoming panel
        if (q.status === "ANSWERED") {
          setPendingQuestion((prev) => (prev?.id === q.id ? null : prev));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [round?.id]);

  // Realtime: deck, hand, pending_draws keep in sync
  useEffect(() => {
    if (!round?.id) return;

    const deckCh = supabase
      .channel(`hide-deck-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decks" }, (payload) => {
        const d = payload.new as any;
        if (d.round_id !== round.id) return;
        setDeck(d as DeckRow);
      })
      .subscribe();

    const handCh = supabase
      .channel(`hide-hand-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hider_state" }, (payload) => {
        const hs = payload.new as any;
        if (hs.round_id !== round.id) return;
        setHiderState(hs as HiderStateRow);
      })
      .subscribe();

    const drawCh = supabase
      .channel(`hide-draw-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_draws" }, (payload) => {
        const pd = payload.new as any;
        if (pd.round_id !== round.id) return;

        if (pd.status === "AWAITING_PICK") {
          setPendingDraw(pd as PendingDrawRow);
          setSelectedKeep(new Set());
        } else if (pd.status === "COMPLETE") {
          setPendingDraw((prev) => (prev?.id === pd.id ? null : prev));
          setSelectedKeep(new Set());
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(deckCh);
      supabase.removeChannel(handCh);
      supabase.removeChannel(drawCh);
    };
  }, [round?.id]);

  function toggleKeep(cardId: string) {
    if (!pendingDraw || pendingDraw.status !== "AWAITING_PICK") return;

    setSelectedKeep((prev) => {
      const next = new Set(prev);

      if (next.has(cardId)) next.delete(cardId);
      else {
        if (next.size >= pendingDraw.keep_count) return next;
        next.add(cardId);
      }

      return next;
    });
  }

  function toggleDiscard(cardId: string) {
    setSelectedDiscard((prev) => {
      const next = new Set(prev);

      if (next.has(cardId)) next.delete(cardId);
      else {
        // In powerup mode, cap selection to required discards
        if (powerupMode && next.size >= discardReq) return next;
        next.add(cardId);
      }

      return next;
    });
  }

  async function submitAnswerAndCreateDraw() {
    setStatusMsg("");

    if (!round?.id) {
      setStatusMsg("Round not loaded.");
      return;
    }
    if (!pendingQuestion) {
      setStatusMsg("No pending question to answer.");
      return;
    }
    if (!deck || !hiderState) {
      setStatusMsg("Deck/hand not loaded.");
      return;
    }
    if (awaitingPick) {
      setStatusMsg("Finish the current draw before answering another question.");
      return;
    }

    // Enforce: one draw per question
    const { data: existingDraws, error: exErr } = await supabase
      .from("pending_draws")
      .select("id")
      .eq("question_id", pendingQuestion.id)
      .limit(1);

    if (exErr) {
      setStatusMsg(`Error checking existing draw: ${exErr.message}`);
      return;
    }
    if (existingDraws && existingDraws.length > 0) {
      setStatusMsg("This question has already generated cards.");
      return;
    }

    const { draw, keep } = getDrawKeep(pendingQuestion.category, { overflowingChalice });

    // Mark question answered
    const { error: qErr } = await supabase
      .from("questions")
      .update({ status: "ANSWERED", answer_text: answerText })
      .eq("id", pendingQuestion.id);

    if (qErr) {
      setStatusMsg(`Answer update error: ${qErr.message}`);
      return;
    }

    // Draw cards (reshuffle discard pile in if needed)
    const { drawn, newDraw, newDiscard } = drawWithReshuffle(deck.draw_pile, deck.discard_pile, draw);

    // Persist deck
    const { error: deckErr } = await supabase
      .from("decks")
      .update({ draw_pile: newDraw, discard_pile: newDiscard })
      .eq("id", deck.id);

    if (deckErr) {
      setStatusMsg(`Deck update error: ${deckErr.message}`);
      return;
    }

    // Create pending draw (kept_cards must be non-null if your schema enforces it)
    const { data: pd, error: pdErr } = await supabase
      .from("pending_draws")
      .insert({
        round_id: round.id,
        question_id: pendingQuestion.id,
        drawn_cards: drawn,
        kept_cards: [], // IMPORTANT for NOT NULL constraint
        keep_count: keep,
        status: "AWAITING_PICK",
      })
      .select("id,round_id,question_id,drawn_cards,kept_cards,keep_count,status,created_at")
      .single();

    if (pdErr || !pd) {
      setStatusMsg(`Pending draw create error: ${pdErr?.message ?? "unknown"}`);
      return;
    }

    // Local UI update
    setPendingQuestion(null);
    setPendingDraw(pd as PendingDrawRow);
    setSelectedKeep(new Set());
    setAnswerText("");
    setStatusMsg("Answer submitted. Select cards to keep.");
  }

  async function confirmKeepSelection() {
    setStatusMsg("");

    if (!round?.id) {
      setStatusMsg("Round not loaded.");
      return;
    }
    if (!pendingDraw || pendingDraw.status !== "AWAITING_PICK") {
      setStatusMsg("No draw awaiting pick.");
      return;
    }
    if (!deck || !hiderState) {
      setStatusMsg("Deck/hand not loaded.");
      return;
    }

    const kept = Array.from(selectedKeep);
    if (kept.length !== pendingDraw.keep_count) {
      setStatusMsg(`Pick exactly ${pendingDraw.keep_count} card(s).`);
      return;
    }

    const unkept = pendingDraw.drawn_cards.filter((c) => !selectedKeep.has(c));

    const newHand = uniq([...hiderState.hand, ...kept]);
    const newDiscard = [...deck.discard_pile, ...unkept];

    // Persist
    const { error: pdErr } = await supabase
      .from("pending_draws")
      .update({ kept_cards: kept, status: "COMPLETE" })
      .eq("id", pendingDraw.id);

    if (pdErr) {
      setStatusMsg(`Pending draw update error: ${pdErr.message}`);
      return;
    }

    const { error: hsErr } = await supabase
      .from("hider_state")
      .update({ hand: newHand })
      .eq("id", hiderState.id);

    if (hsErr) {
      setStatusMsg(`Hand update error: ${hsErr.message}`);
      return;
    }

    const { error: deckErr } = await supabase
      .from("decks")
      .update({ discard_pile: newDiscard })
      .eq("id", deck.id);

    if (deckErr) {
      setStatusMsg(`Deck discard update error: ${deckErr.message}`);
      return;
    }

    // Unlock seekers
    const { error: clearErr } = await supabase
      .from("rounds")
      .update({ active_question_id: null })
      .eq("id", round.id);

    if (clearErr) {
      setStatusMsg(`Cards resolved, but failed to clear active question: ${clearErr.message}`);
      return;
    }

    // Local updates
    setHiderState((prev) => (prev ? { ...prev, hand: newHand } : prev));
    setDeck((prev) => (prev ? { ...prev, discard_pile: newDiscard } : prev));
    setPendingDraw(null);
    setSelectedKeep(new Set());
    setStatusMsg("Kept cards added to hand. Seekers can ask another question now.");
  }

  // Manual discard (still available, but disabled during powerup selection)
  async function discardSelectedFromHand() {
    setStatusMsg("");

    if (!hiderState || !deck) {
      setStatusMsg("Hand/deck not loaded.");
      return;
    }
    if (awaitingPick) {
      setStatusMsg("Finish the current draw before discarding from hand.");
      return;
    }
    if (powerupMode) {
      setStatusMsg("Finish/cancel the powerup before discarding normally.");
      return;
    }

    const toDiscard = Array.from(selectedDiscard);
    if (toDiscard.length === 0) return;

    const newHand = hiderState.hand.filter((c) => !selectedDiscard.has(c));
    const newDiscardPile = [...deck.discard_pile, ...toDiscard];

    const { error: handErr } = await supabase
      .from("hider_state")
      .update({ hand: newHand })
      .eq("id", hiderState.id);

    if (handErr) {
      setStatusMsg(`Discard failed (hand): ${handErr.message}`);
      return;
    }

    const { error: deckErr } = await supabase
      .from("decks")
      .update({ discard_pile: newDiscardPile })
      .eq("id", deck.id);

    if (deckErr) {
      setStatusMsg(`Discard failed (deck): ${deckErr.message}`);
      return;
    }

    setHiderState((prev) => (prev ? { ...prev, hand: newHand } : prev));
    setDeck((prev) => (prev ? { ...prev, discard_pile: newDiscardPile } : prev));
    setSelectedDiscard(new Set());

    setStatusMsg(`Discarded ${toDiscard.length} card(s) back into the deck.`);
  }

  async function confirmPlayDiscardDraw() {
    setStatusMsg("");

    if (!powerupMode) return;
    if (!hiderState || !deck) {
      setStatusMsg("Hand/deck not loaded.");
      return;
    }
    if (awaitingPick) {
      setStatusMsg("Finish the current draw before playing a powerup.");
      return;
    }

    const powerupCard = powerupMode; // "DISCARD_1_DRAW_2" | "DISCARD_2_DRAW_3"

    // Must still have the powerup in hand
    if (!hiderState.hand.includes(powerupCard)) {
      setStatusMsg(`You no longer have ${powerupCard} in hand.`);
      setPowerupMode(null);
      setSelectedDiscard(new Set());
      return;
    }

    const chosen = Array.from(selectedDiscard);

    // Discard choices cannot include the powerup itself (it discards automatically)
    if (chosen.includes(powerupCard)) {
      setStatusMsg("Do not select the powerup card itself—only select the extra card(s) to discard.");
      return;
    }

    if (chosen.length !== discardReq) {
      setStatusMsg(`Select exactly ${discardReq} card(s) to discard for this powerup.`);
      return;
    }

    // Ensure you have enough OTHER cards
    const otherCount = hiderState.hand.filter((c) => c !== powerupCard).length;
    if (otherCount < discardReq) {
      setStatusMsg("Not enough extra cards to discard for this powerup.");
      return;
    }

    // Remove: powerup + chosen discards (remove one instance of the powerup card)
    let removedPowerup = false;
    const newHand: string[] = [];
    for (const c of hiderState.hand) {
      if (!removedPowerup && c === powerupCard) {
        removedPowerup = true;
        continue;
      }
      if (selectedDiscard.has(c)) continue;
      newHand.push(c);
    }

    // Move to discard pile
    const toDiscard = [powerupCard, ...chosen];
    const discardPileAfterCost = [...deck.discard_pile, ...toDiscard];

    // Draw and keep N new cards
    const { drawn, newDraw, newDiscard } = drawWithReshuffle(
      deck.draw_pile,
      discardPileAfterCost,
      drawGain
    );

    const finalHand = [...newHand, ...drawn];

    // Persist
    const { error: hsErr } = await supabase
      .from("hider_state")
      .update({ hand: finalHand })
      .eq("id", hiderState.id);
    if (hsErr) {
      setStatusMsg(`Powerup failed (hand): ${hsErr.message}`);
      return;
    }

    const { error: deckErr } = await supabase
      .from("decks")
      .update({ draw_pile: newDraw, discard_pile: newDiscard })
      .eq("id", deck.id);
    if (deckErr) {
      setStatusMsg(`Powerup failed (deck): ${deckErr.message}`);
      return;
    }

    // Local UI
    setHiderState((prev) => (prev ? { ...prev, hand: finalHand } : prev));
    setDeck((prev) => (prev ? { ...prev, draw_pile: newDraw, discard_pile: newDiscard } : prev));
    setSelectedDiscard(new Set());
    setPowerupMode(null);
    setStatusMsg(`Played ${powerupCard}. Discarded ${discardReq} and kept ${drawGain} new cards.`);
  }

  async function playDraw1ExpandHand() {
    setStatusMsg("");

    if (!hiderState || !deck) {
      setStatusMsg("Hand/deck not loaded.");
      return;
    }
    if (awaitingPick) {
      setStatusMsg("Finish the current draw before playing a powerup.");
      return;
    }

    const card = "DRAW_1_EXPAND_HAND";
    if (!hiderState.hand.includes(card)) {
      setStatusMsg("You do not have DRAW_1_EXPAND_HAND in hand.");
      return;
    }

    // Remove one instance of the card from hand
    let removed = false;
    const newHandBase: string[] = [];
    for (const c of hiderState.hand) {
      if (!removed && c === card) {
        removed = true;
        continue;
      }
      newHandBase.push(c);
    }

    // Discard the powerup card
    const discardAfter = [...deck.discard_pile, card];

    // Draw 1 and keep it (goes straight into hand)
    const { drawn, newDraw, newDiscard } = drawWithReshuffle(deck.draw_pile, discardAfter, 1);
    const finalHand = [...newHandBase, ...drawn];

    const newMax = (hiderState.max_hand_size ?? 0) + 1;

    // Persist
    const { error: hsErr } = await supabase
      .from("hider_state")
      .update({ hand: finalHand, max_hand_size: newMax })
      .eq("id", hiderState.id);
    if (hsErr) {
      setStatusMsg(`Expand failed (hand): ${hsErr.message}`);
      return;
    }

    const { error: deckErr } = await supabase
      .from("decks")
      .update({ draw_pile: newDraw, discard_pile: newDiscard })
      .eq("id", deck.id);
    if (deckErr) {
      setStatusMsg(`Expand failed (deck): ${deckErr.message}`);
      return;
    }

    // Local UI
    setHiderState((prev) => (prev ? { ...prev, hand: finalHand, max_hand_size: newMax } : prev));
    setDeck((prev) => (prev ? { ...prev, draw_pile: newDraw, discard_pile: newDiscard } : prev));
    setSelectedDiscard(new Set());
    setPowerupMode(null);

    setStatusMsg("Played DRAW_1_EXPAND_HAND: drew 1 (kept) and increased max hand size by 1.");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black/5 to-white px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Hider</h1>
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
            title="Rules modifiers"
            right={
              <span className="text-xs font-semibold text-black/50">
                {overflowingChalice ? "Overflowing Chalice: ON" : "Overflowing Chalice: OFF"}
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={overflowingChalice ? "primary" : "secondary"}
                onClick={() => setOverflowingChalice((v) => !v)}
              >
                Toggle Overflowing Chalice
              </Button>
              <div className="text-xs text-black/60">
                This only affects draw counts when answering questions.
              </div>
            </div>
          </Card>

          <Card
            title="Incoming question"
            right={
              <span className="text-xs font-semibold text-black/50">
                {pendingQuestion ? "New" : "None"}
              </span>
            }
          >
            {!pendingQuestion ? (
              <p className="text-sm text-black/60">No pending question right now.</p>
            ) : (
              <div className="grid gap-4">
                <div className="text-xs text-black/60">
                  Category:{" "}
                  <span className="font-semibold text-black">{pendingQuestion.category}</span>
                </div>

                <div className="text-base font-semibold">{pendingQuestion.question_text}</div>

                <Field label="Answer">
                  <Input
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Type the answer…"
                  />
                </Field>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={submitAnswerAndCreateDraw} disabled={awaitingPick}>
                    Submit answer → Draw cards
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!round?.id) return;
                      await loadPendingQuestion(round.id);
                      await loadPendingDraw(round.id);
                      await loadDeckAndHand(round.id);
                      setStatusMsg("Refreshed.");
                    }}
                  >
                    Refresh
                  </Button>
                </div>

                {awaitingPick ? (
                  <p className="text-xs text-black/60">
                    Finish the current draw before answering another question.
                  </p>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="Draw selection">
            {!pendingDraw || pendingDraw.status !== "AWAITING_PICK" ? (
              <p className="text-sm text-black/60">No draw awaiting a pick.</p>
            ) : (
              <div className="grid gap-4">
                <div className="text-xs text-black/60">
                  Pick{" "}
                  <span className="font-semibold text-black">{keepNeeded}</span> card(s). Selected{" "}
                  <span className="font-semibold text-black">{keepPicked}</span>.
                </div>

                <div className="flex flex-wrap gap-2">
                  {pendingDraw.drawn_cards.map((c) => {
                    const selected = selectedKeep.has(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleKeep(c)}
                        className={
                          "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                          (selected
                            ? "border-black bg-black text-white"
                            : "border-black/10 bg-white hover:bg-black/5")
                        }
                        type="button"
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={confirmKeepSelection} disabled={!canConfirmKeep}>
                    Confirm keep
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedKeep(new Set())}
                    disabled={selectedKeep.size === 0}
                  >
                    Clear selection
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card title="Your hand">
            {!hiderState ? (
              <p className="text-sm text-black/60">Hand not loaded.</p>
            ) : hiderState.hand.length === 0 ? (
              <p className="text-sm text-black/60">Hand is empty.</p>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-black/60">
                    Max hand size:{" "}
                    <span className="font-semibold text-black">{hiderState.max_hand_size}</span> •
                    Selected:{" "}
                    <span className="font-semibold text-black">{selectedDiscard.size}</span>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="text-xs font-semibold text-black/60">Powerups</div>

                  {!powerupMode ? (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        disabled={!canEnterDiscard1}
                        onClick={() => {
                          setPowerupMode("DISCARD_1_DRAW_2");
                          setSelectedDiscard(new Set());
                          setStatusMsg("Powerup mode: select 1 card to discard (not the powerup), then confirm.");
                        }}
                      >
                        Play DISCARD_1_DRAW_2
                      </Button>

                      <Button
                        variant="secondary"
                        disabled={!canEnterDiscard2}
                        onClick={() => {
                          setPowerupMode("DISCARD_2_DRAW_3");
                          setSelectedDiscard(new Set());
                          setStatusMsg("Powerup mode: select 2 cards to discard (not the powerup), then confirm.");
                        }}
                      >
                        Play DISCARD_2_DRAW_3
                      </Button>

                      <Button
                        variant="secondary"
                        disabled={!canPlayExpand}
                        onClick={playDraw1ExpandHand}
                      >
                        Play DRAW_1_EXPAND_HAND
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-xs text-black/60">
                        Mode:{" "}
                        <span className="font-semibold text-black">{powerupMode}</span> — select{" "}
                        <span className="font-semibold text-black">{discardReq}</span> discard card(s)
                        (not including the powerup).
                      </div>

                      <Button onClick={confirmPlayDiscardDraw} disabled={selectedDiscard.size !== discardReq}>
                        Confirm play
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPowerupMode(null);
                          setSelectedDiscard(new Set());
                          setStatusMsg("Cancelled powerup.");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                <div className="text-xs text-black/60">
                  Click cards to select. {powerupMode ? `Selection capped at ${discardReq}.` : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {hiderState.hand.map((c) => {
                    const selected = selectedDiscard.has(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleDiscard(c)}
                        className={
                          "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                          (selected
                            ? "border-black bg-black text-white"
                            : "border-black/10 bg-white hover:bg-black/5")
                        }
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="danger" onClick={discardSelectedFromHand} disabled={!canDiscard}>
                    Discard selected
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedDiscard(new Set())}
                    disabled={selectedDiscard.size === 0}
                  >
                    Clear selection
                  </Button>
                </div>

                {awaitingPick ? (
                  <p className="text-xs text-black/60">
                    Hand actions are disabled while you have a draw awaiting a pick.
                  </p>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="Deck debug">
            {!deck ? (
              <p className="text-sm text-black/60">Deck not loaded.</p>
            ) : (
              <div className="grid gap-2 text-sm text-black/70">
                <div>
                  Draw pile:{" "}
                  <span className="font-semibold text-black">{deck.draw_pile.length}</span>
                </div>
                <div>
                  Discard pile:{" "}
                  <span className="font-semibold text-black">{deck.discard_pile.length}</span>
                </div>
                <div className="text-xs text-black/50">
                  When the draw pile is too small, discards are reshuffled back into the draw pile automatically.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
