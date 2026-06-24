import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "TrailerFlow — 映画館の予告編タイムを、ずっと。";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontBold = readFileSync(
  join(process.cwd(), "app/fonts/NotoSansJP-Bold.ttf"),
);

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#0a0a0b",
          backgroundImage:
            "radial-gradient(circle at 28% 30%, rgba(245,166,35,0.22), transparent 55%)",
          padding: "80px",
          fontFamily: '"Noto Sans JP", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 12,
            color: "#f5a623",
            fontWeight: 700,
          }}
        >
          NOW SHOWING
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 132,
            fontWeight: 800,
            marginTop: 18,
            color: "#f5f5f7",
            lineHeight: 1,
          }}
        >
          Trailer<span style={{ color: "#f5a623" }}>Flow</span>
        </div>

        <div
          style={{
            fontSize: 38,
            color: "rgba(245,245,247,0.95)",
            marginTop: 32,
            fontWeight: 700,
          }}
        >
          映画館の予告編タイムを、ずっと。
        </div>
        <div
          style={{
            fontSize: 24,
            color: "rgba(245,245,247,0.55)",
            marginTop: 14,
            fontWeight: 700,
          }}
        >
          YouTubeに素材はある。でも、予告編タイムはなかった。
        </div>

        {/* Film-strip motif */}
        <div style={{ display: "flex", gap: 14, marginTop: 56 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 96,
                height: 18,
                borderRadius: 4,
                backgroundColor:
                  i % 3 === 0 ? "#f5a623" : "rgba(245,245,247,0.16)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontBold,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
