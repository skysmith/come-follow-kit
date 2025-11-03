// pages/api/weeks.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getWeeks } from "../../data/schedule";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const weeks = getWeeks();
    res.status(200).json({ weeks });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed_to_build_weeks" });
  }
}