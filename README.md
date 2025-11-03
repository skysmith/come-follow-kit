# come-follow kit

minimal mvp to generate lesson packs + art prompts by week.

## dev
1) `npm i`
2) add `.env.local` with `OPENAI_API_KEY=...`
3) `npm run dev` → http://localhost:3000

## deploy
- push to github
- import on vercel
- add `OPENAI_API_KEY` in project env
- deploy

## add weeks
- edit `data/weeks.json`

## notes
- outputs are plain text/markdown; copy into your notes or print
- footer reminds: scripture-anchored, you review before teaching