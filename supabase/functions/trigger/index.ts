import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JoinReq = { action: "join"; name: string; playerId?: string };
type TriggerReq = { action: "trigger"; playerId: string; code: string };
type ReqBody = JoinReq | TriggerReq;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// QR -> state patch
function mapCodeToPatch(code: string): Partial<{ room: string; pose: string; item: string; x: number; y: number }> | null {
  if (code === "cheers") return { pose: "cheers", item: "glass" };
  if (code === "dance") return { pose: "dance" };
  if (code === "idle") return { pose: "idle", item: "none" };
  if (code === "hat") return { item: "partyhat" };

  if (code.startsWith("room:")) {
    const room = code.slice("room:".length).trim();
    if (room) return { room };
  }

  if (code.startsWith("move:")) {
    const raw = code.slice("move:".length);
    const [xs, ys] = raw.split(",").map(s => s.trim());
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x: clamp01(x), y: clamp01(y) };
  }

  return null;
}

// Rate limit: max 4 triggers per 10 seconds per player
async function enforceRateLimit(supabaseAdmin: any, playerId: string) {
  const WINDOW_SECONDS = 10;
  const MAX_HITS = 4;

  const now = new Date();
  const { data: row, error } = await supabaseAdmin
    .from("rate_limits")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!row) {
    const ins = await supabaseAdmin.from("rate_limits").insert({
      player_id: playerId,
      window_start: now.toISOString(),
      hits: 1,
    });
    if (ins.error) throw new Error(ins.error.message);
    return;
  }

  const windowStart = new Date(row.window_start);
  const ageSeconds = (now.getTime() - windowStart.getTime()) / 1000;

  if (ageSeconds > WINDOW_SECONDS) {
    const upd = await supabaseAdmin
      .from("rate_limits")
      .update({ window_start: now.toISOString(), hits: 1 })
      .eq("player_id", playerId);
    if (upd.error) throw new Error(upd.error.message);
    return;
  }

  if (row.hits >= MAX_HITS) return "RATE_LIMITED";

  const upd = await supabaseAdmin
    .from("rate_limits")
    .update({ hits: row.hits + 1 })
    .eq("player_id", playerId);
  if (upd.error) throw new Error(upd.error.message);
}

// Spawn: random with minimum distance to others
async function findSpawn(supabaseAdmin: any, room: string) {
  const MARGIN = 0.12;     // keep away from edges
  const MIN_DIST = 0.10;   // keep distance to other players
  const MAX_TRIES = 40;

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // last 2h

  const { data, error } = await supabaseAdmin
    .from("player_state")
    .select("x,y,updated_at")
    .eq("room", room);

  if (error) throw new Error(error.message);

  const others = (data ?? [])
    .filter((r: any) => (r.updated_at ?? "9999") >= cutoff)
    .map((r: any) => ({ x: Number(r.x), y: Number(r.y) }))
    .filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y));

  for (let i = 0; i < MAX_TRIES; i++) {
    const x = MARGIN + Math.random() * (1 - 2 * MARGIN);
    const y = MARGIN + Math.random() * (1 - 2 * MARGIN);
    if (others.every(o => dist(o.x, o.y, x, y) >= MIN_DIST)) return { x, y };
  }

  // fallback if crowded
  return {
    x: MARGIN + Math.random() * (1 - 2 * MARGIN),
    y: MARGIN + Math.random() * (1 - 2 * MARGIN),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRole);

    const body = (await req.json()) as ReqBody;

    if (body.action === "join") {
      const name = body.name?.trim();
      if (!name || name.length > 32) return json(400, { error: "Invalid name" });

      const playerId = body.playerId ?? crypto.randomUUID();

      // Upsert player
      const up1 = await supabaseAdmin.from("players").upsert({
        id: playerId,
        name,
        last_seen: new Date().toISOString(),
      }, { onConflict: "id" });

      if (up1.error) return json(500, { error: up1.error.message });

      // Create state row only if missing (so we don't overwrite position)
      const { data: existingState, error: stErr } = await supabaseAdmin
        .from("player_state")
        .select("player_id")
        .eq("player_id", playerId)
        .maybeSingle();

      if (stErr) return json(500, { error: stErr.message });

      if (!existingState) {
        const { x, y } = await findSpawn(supabaseAdmin, "main");

        const ins = await supabaseAdmin.from("player_state").insert({
          player_id: playerId,
          room: "main",
          pose: "idle",
          item: "none",
          x,
          y,
          updated_at: new Date().toISOString(),
        });

        if (ins.error) return json(500, { error: ins.error.message });
      } else {
        // touch updated_at
        await supabaseAdmin.from("player_state")
          .update({ updated_at: new Date().toISOString() })
          .eq("player_id", playerId);
      }

      return json(200, { playerId });
    }

    if (body.action === "trigger") {
      const playerId = body.playerId;
      const code = body.code?.trim();
      if (!playerId || !code) return json(400, { error: "Missing playerId/code" });

      const rl = await enforceRateLimit(supabaseAdmin, playerId);
      if (rl === "RATE_LIMITED") return json(429, { error: "Too many actions. Slow down 🙂" });

      const patch = mapCodeToPatch(code);
      if (!patch) return json(400, { error: "Unknown code" });

      const upd = await supabaseAdmin
        .from("player_state")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("player_id", playerId);

      if (upd.error) return json(500, { error: upd.error.message });

      await supabaseAdmin.from("events").insert({
        actor_player_id: playerId,
        type: "qr_triggered",
        payload: { code, patch },
      });

      await supabaseAdmin.from("players")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", playerId);

      return json(200, { ok: true, patch });
    }

    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: String(e?.message ?? e) });
  }
});
