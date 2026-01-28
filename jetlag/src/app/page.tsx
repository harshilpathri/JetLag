"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { HIDER_DECK } from "@/lib/deck";


type GameSize = "SMALL" | "MEDIUM" | "LARGE";
type RoomRow = { id: string; code: string; game_size: GameSize };

function normalizeRoomCode(raw: string) {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function HomePage() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [createCodeInput, setCreateCodeInput] = useState("TEST123");
  const createCode = useMemo(() => normalizeRoomCode(createCodeInput), [createCodeInput]);
  const [createSize, setCreateSize] = useState<GameSize>("SMALL");

  const [joinSelectedCode, setJoinSelectedCode] = useState<string>("");

  const [statusMsg, setStatusMsg] = useState<string>("");

  async function refreshRooms() {
    setLoadingRooms(true);
    setStatusMsg("");

    const { data, error } = await supabase
      .from("rooms")
      .select("id,code,game_size")
      .order("created_at", { ascending: false });

    setLoadingRooms(false);

    if (error) {
      setStatusMsg(`Room list error: ${error.message}`);
      return;
    }

    const list = (data ?? []) as RoomRow[];
    setRooms(list);

    if (!joinSelectedCode && list.length > 0) {
      setJoinSelectedCode(list[0].code);
    }
  }

  useEffect(() => {
    refreshRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRoomAndRound() {
    setStatusMsg("");

    if (!createCode) {
      setStatusMsg("Enter a room code to create.");
      return;
    }

    const { data: roomUpserted, error: roomErr } = await supabase
      .from("rooms")
      .upsert({ code: createCode, game_size: createSize }, { onConflict: "code" })
      .select("id,code,game_size")
      .single();

    if (roomErr || !roomUpserted) {
      setStatusMsg(`Room create error: ${roomErr?.message ?? "unknown"}`);
      return;
    }

    const { data: roundCreated, error: roundErr } = await supabase
      .from("rounds")
      .insert({ room_id: roomUpserted.id, active_question_id: null })
      .select("id")
      .single();

    if (roundErr || !roundCreated) {
      setStatusMsg(`Round create error: ${roundErr?.message ?? "unknown"}`);
      return;
    }

    const { error: hsErr } = await supabase.from("hider_state").insert({
      round_id: roundCreated.id,
      hand: [],
      max_hand_size: 6,
    });
    if (hsErr) {
      setStatusMsg(`Hider state create error: ${hsErr.message}`);
      return;
    }

    const shuffled = shuffle(HIDER_DECK);
    const { error: deckErr } = await supabase.from("decks").insert({
      round_id: roundCreated.id,
      draw_pile: shuffled,
      discard_pile: [],
    });
    if (deckErr) {
      setStatusMsg(`Deck create error: ${deckErr.message}`);
      return;
    }

    await refreshRooms();
    setStatusMsg(`Created room ${roomUpserted.code} (${roomUpserted.game_size}) with a new round.`);
  }

  function joinRoom(role: "seek" | "hide") {
    setStatusMsg("");
    if (!joinSelectedCode) {
      setStatusMsg("Select a room to join.");
      return;
    }
    window.location.assign(`/room/${joinSelectedCode}/${role}`);
  }

  async function deleteEverythingDev() {
    setStatusMsg("Deleting all rows…");

    const order = ["pending_draws", "questions", "hider_state", "decks", "rounds", "rooms"] as const;

    for (const table of order) {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) {
        setStatusMsg(`Delete error on ${table}: ${error.message}`);
        return;
      }
    }

    setStatusMsg("Deleted all rows from all tables (dev reset complete).");
    setRooms([]);
    setJoinSelectedCode("");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black/5 to-white px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Hide & Seek</h1>
          <p className="mt-2 text-sm text-black/60">
            Create a room (new round + deck + hand), or join an existing room.
          </p>
          {statusMsg ? <Notice text={statusMsg} /> : null}
        </header>

        <div className="grid gap-6">
          <Card title="Create a room">
            <div className="grid gap-4">
              <Field
                label="Room code"
                hint={`Normalized: ${createCode || "(empty)"}`}
              >
                <Input
                  value={createCodeInput}
                  onChange={(e) => setCreateCodeInput(e.target.value)}
                  placeholder="e.g. TEST123"
                />
              </Field>

              <Field label="Game size">
                <Select
                  value={createSize}
                  onChange={(e) => setCreateSize(e.target.value as GameSize)}
                >
                  <option value="SMALL">SMALL</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LARGE">LARGE</option>
                </Select>
              </Field>

              <div className="flex items-center gap-3">
                <Button onClick={createRoomAndRound} variant="primary">
                  Create Room
                </Button>
                <Button onClick={refreshRooms} variant="secondary" disabled={loadingRooms}>
                  {loadingRooms ? "Refreshing…" : "Refresh room list"}
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Join a room">
            <div className="grid gap-4">
              <Field label="Select room">
                <Select
                  value={joinSelectedCode}
                  onChange={(e) => setJoinSelectedCode(e.target.value)}
                  disabled={rooms.length === 0}
                >
                  {rooms.length === 0 ? (
                    <option value="">(No rooms found)</option>
                  ) : (
                    rooms.map((r) => (
                      <option key={r.id} value={r.code}>
                        {r.code} ({r.game_size})
                      </option>
                    ))
                  )}
                </Select>
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => joinRoom("seek")} variant="primary">
                  Join as Seekers
                </Button>
                <Button onClick={() => joinRoom("hide")} variant="secondary">
                  Join as Hider
                </Button>
              </div>
            </div>
          </Card>

          <details className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-black/70">
              Dev reset (danger)
            </summary>
            <p className="mt-3 text-sm text-black/60">
              Deletes all rows from all tables in this Supabase project (dev only).
            </p>
            <div className="mt-4">
              <Button onClick={deleteEverythingDev} variant="danger">
                Delete EVERYTHING in DB (DEV)
              </Button>
            </div>
          </details>

          <p className="text-xs text-black/50">
            DEV NOTE: This assumes RLS is OFF. For a public deployment, move create/reset to a server route and enable RLS.
          </p>
        </div>
      </div>
    </main>
  );
}
