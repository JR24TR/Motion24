import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { getProfile, dailyBonusStatus, dailyWinChallengeStatus, referralStats, winRateStats } from "@/server/services/players";
import { getReward } from "@/server/services/settings";

/**
 * Earn-page aggregate. Thin wrapper over the existing player/reward services.
 * All reward amounts are read from the server-side `rewards` config — never
 * hardcoded client-side. The daily claim itself uses POST /api/rewards/daily/claim.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const profile = getProfile(user.id)!;

    const dailyLogin = getReward("DAILY_LOGIN", 100, 10);
    const victory = getReward("GAME_VICTORY", 500, 0);
    const challenge = getReward("CHALLENGE_WIN_DAILY", 250, 25);
    const referralBonus = getReward("REFERRAL_BONUS", 500, 50);
    const referralWelcome = getReward("REFERRAL_WELCOME", 250, 0);

    const daily = dailyBonusStatus(user.id);
    const dailyWin = dailyWinChallengeStatus(user.id);
    const referral = referralStats(user.id);
    const winRate = winRateStats(user.id);

    return {
      balance: profile.balance,
      referralCode: profile.referralCode,
      daily: {
        amount: dailyLogin.arc,
        xp: dailyLogin.xp,
        claimedToday: daily.claimedToday,
        lastClaimAt: daily.lastClaimAt,
      },
      victoryFloor: victory.arc,
      dailyWinChallenge: {
        amount: challenge.arc,
        xp: challenge.xp,
        claimedToday: dailyWin.claimedToday,
        winsToday: dailyWin.winsToday,
      },
      referral: {
        count: referral.count,
        bonus: referralBonus.arc,
        welcome: referralWelcome.arc,
      },
      winRate,
    };
  });
}
