import type { Metadata } from "next";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import FollowCTA from "@/components/FollowCTA";

export const metadata: Metadata = {
  title: "About",
  description: "TrailerFlow について",
};

const CONTACT_EMAIL = "hello@trailerflow.example";

export default function AboutPage() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Wordmark />
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← 再生に戻る
        </Link>
      </header>

      <h1 className="text-3xl font-bold tracking-tight">TrailerFlow について</h1>

      <section className="mt-8 space-y-6">
        <p className="text-2xl font-bold leading-snug text-white">
          YouTube に素材はある。
          <br />
          でも、<span className="text-accent">予告編タイム</span>はなかった。
        </p>
        <div className="space-y-4 text-white/80 leading-relaxed">
          <p>
            映画館で本編が始まる前、いろんな予告編が次々と流れてくるあの時間。
            TrailerFlow は、その「予告編タイム」を Web
            上にそのまま持ち込みます。検索して探すのではなく、開いた瞬間から予告編が連続で流れ続けます。
          </p>
          <p>
            <span className="font-bold text-white">新作だけじゃない。</span>
            最新作の本予告、昔の名作、邦画も洋画も、アニメもゲームも配信ドラマも、ミニシアター系も。時代もジャンルも形態も超えて、
            <span className="font-bold text-white">
              予告編という文化そのものを浴びる
            </span>
            場所です。
          </p>
          <p>
            だから TrailerFlow は、予告編を
            <span className="font-bold text-white">探す</span>
            場所ではありません。予告編タイムに
            <span className="font-bold text-accent">入る</span>
            場所です。気になった作品は「観たい」で記録し、「次へ」で送り、「この系統もっと」「今は違う」で流れを育てていけます。ログインは不要で、好みはこのブラウザの中だけに記録されます。
          </p>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-bold">データと権利について</h2>
        <ul className="space-y-3 text-sm text-white/70 leading-relaxed">
          <li className="rounded-xl border border-lobby-border bg-lobby-surface p-4">
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
            <br />
            <span className="text-white/50">
              映画のメタデータ（タイトル・あらすじ・ポスター等）は TMDb API
              を利用しています。
            </span>
          </li>
          <li className="rounded-xl border border-lobby-border bg-lobby-surface p-4">
            予告編動画は YouTube
            の埋め込みプレイヤーを通じて再生しています。TrailerFlow
            は動画ファイルそのものを保存・配信していません。
          </li>
          <li className="rounded-xl border border-lobby-border bg-lobby-surface p-4">
            各予告編およびその内容に関する権利は、それぞれの権利者に帰属します。TrailerFlow
            はこれらの権利を主張するものではありません。
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <FollowCTA />
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-bold">お問い合わせ</h2>
        <p className="text-sm text-white/70">
          ご意見・権利に関するお問い合わせは{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-accent hover:underline"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          まで（※これは MVP 用の仮の連絡先です）。
        </p>
      </section>

      <footer className="mt-12 border-t border-lobby-border pt-6 text-xs text-white/30">
        TrailerFlow — 映画館の予告編タイムを、ずっと。
      </footer>
    </main>
  );
}
