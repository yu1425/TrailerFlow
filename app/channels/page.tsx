"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChannelSelector from "@/components/ChannelSelector";
import Wordmark from "@/components/Wordmark";

const CHANNEL_STORAGE_KEY = "trailerflow.channel";

export default function ChannelsPage() {
  const router = useRouter();
  const [selected, setSelected] = useState("lobby");

  const handleSelect = (channelId: string) => {
    setSelected(channelId);
    try {
      window.localStorage.setItem(CHANNEL_STORAGE_KEY, channelId);
    } catch {
      // ignore
    }
    // Jump straight into the immersive player on the chosen channel.
    router.push("/");
  };

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← 再生に戻る
        </Link>
      </header>

      <h1 className="text-2xl font-bold">チャンネルを選ぶ</h1>
      <p className="mt-2 text-sm text-white/50">
        気分に合わせて予告編の流れを切り替えられます。選ぶとすぐに再生が始まります。
      </p>

      <div className="mt-8">
        <ChannelSelector
          variant="grid"
          selected={selected}
          onSelect={handleSelect}
        />
      </div>
    </main>
  );
}
