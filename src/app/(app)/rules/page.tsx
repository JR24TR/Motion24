import type { Metadata } from "next";
import { listGames } from "@/server/services/games";
import { getReward } from "@/server/services/settings";
import { getEngine, parseEngineConfig } from "@/server/games/engines";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rules",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-mute">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  const games = listGames({ activeOnly: true });
  const coinRush = games.find((g) => g.engine === "coin-rush");
  const cfg = coinRush ? (parseEngineConfig("coin-rush", coinRush.config) as Record<string, number>) : null;

  const dailyLogin = getReward("DAILY_LOGIN", 100, 10);
  const victory = getReward("GAME_VICTORY", 500, 0);
  const challenge = getReward("CHALLENGE_WIN_DAILY", 250, 25);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-black text-ink">Rules & How to Play</h1>
        <p className="mt-0.5 text-sm text-mute">How ARC works, how games pay out, and fair-play rules.</p>
      </header>

      <Card className="p-6">
        <Section title="How ARC works">
          <p>
            ARC is the virtual currency of MOTION24. You earn it through daily bonuses, game
            victories, challenges, achievements and referrals, and spend it to enter games.
          </p>
          <p>
            ARC is a virtual currency for this platform only. It has no real-world monetary value,
            cannot be withdrawn, and cannot be exchanged for cash.
          </p>
        </Section>
      </Card>

      <Card className="p-6">
        <Section title="Game entry fees">
          <p>
            Entering a game costs an entry fee, deducted from your balance before you play. If you
            don't have enough ARC, you'll be told how much is required.
          </p>
          {coinRush ? (
            <p>
              {coinRush.name}: entry fee{" "}
              <span className="tnum font-semibold text-ink">{coinRush.entryCost.toLocaleString()} ARC</span>,
              rewards up to{" "}
              <span className="tnum font-semibold text-arc">{coinRush.maxReward.toLocaleString()} ARC</span>.
            </p>
          ) : null}
        </Section>
      </Card>

      <Card className="p-6">
        <Section title="How rewards are determined">
          <p>
            Rewards are calculated server-side based on your score relative to the game's maximum.
            Higher scores earn higher reward tiers. Every win also guarantees the{" "}
            <span className="tnum font-semibold text-arc">{victory.arc.toLocaleString()} ARC</span> victory floor.
          </p>
          <p>
            Your reward, XP, achievements and resulting balance are always computed by the server —
            the game client never decides how much you earn.
          </p>
        </Section>
      </Card>

      {coinRush ? (
        <Card className="p-6">
          <Section title="COIN RUSH — how to play">
            <p>{coinRush.description}</p>
            <ul className="list-inside space-y-1.5">
              <li>🪙 Tap coins for points — gold coins are worth more.</li>
              <li>💣 Avoid bombs — they subtract points.</li>
              {cfg ? (
                <li>
                  <span className="text-ink">
                    Each round lasts <span className="tnum font-semibold">{cfg.durationSec}s</span>,
                    with coins worth <span className="tnum font-semibold">{cfg.coinPoints}</span>, gold{" "}
                    <span className="tnum font-semibold">{cfg.goldPoints}</span>, and bombs{" "}
                    <span className="tnum font-semibold">{cfg.bombPoints}</span>.
                  </span>
                </li>
              ) : null}
            </ul>
          </Section>
        </Card>
      ) : null}

      <Card className="p-6">
        <Section title="Win / loss mechanics">
          <p>
            Reaching the game's win threshold makes the round a victory, unlocking the daily-win
            challenge bonus and counting toward achievements.
          </p>
          <p>
            If you leave a game mid-play or submit too late, the session is forfeited and the entry
            fee is not refunded.
          </p>
        </Section>
      </Card>

      <Card className="p-6">
        <Section title="Daily rewards & challenges">
          <p>
            Daily reward:{" "}
            <span className="tnum font-semibold text-arc">{dailyLogin.arc.toLocaleString()} ARC</span>
            {dailyLogin.xp > 0 ? <span> + <span className="tnum font-semibold text-xp">{dailyLogin.xp} XP</span></span> : null}{" "}
            once per day.
          </p>
          <p>
            Daily challenge: win a game each day for{" "}
            <span className="tnum font-semibold text-arc">{challenge.arc.toLocaleString()} ARC</span>
            {challenge.xp > 0 ? <span> + <span className="tnum font-semibold text-xp">{challenge.xp} XP</span></span> : null}.
          </p>
        </Section>
      </Card>

      <Card className="p-6">
        <Section title="Fair play & security">
          <p>
            All balances, rewards, XP and achievements are tracked and verified on the server. You
            cannot edit your balance, XP, role or account ID from the client.
          </p>
          <p>
            Exploiting bugs, abusing referrals, or attempting to tamper with game results may result
            in suspension.
          </p>
        </Section>
      </Card>

      <Card className="p-6">
        <Section title="Account rules">
          <p>
            One account per person. Keep your password private and use a valid email. The admin may
            suspend accounts that violate these rules.
          </p>
        </Section>
      </Card>
    </div>
  );
}
