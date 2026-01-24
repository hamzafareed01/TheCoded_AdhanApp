import { useEffect, useRef, useState } from "react";
import { BookOpen, Headphones, Play, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { apiFetch } from "../../lib/api";

type Dua = {
  id: string;
  category: string;
  title: string;
  textArabic: string;
  textTransliteration?: string;
  textTranslation: string;
  audioUrl?: string;
  tags?: string[];
};

type SurahSummary = {
  id: number;
  number: number;
  nameArabic: string;
  nameEnglish: string;
  englishNameTranslation: string;
  ayahCount: number;
  revelationType: string;
};

type Verse = {
  numberInSurah: number;
  textArabic: string;
  textTranslation?: string | null;
  textTransliteration?: string | null;
  audioUrl?: string | null;
  audioVariants?: string[];
};

type SurahDetail = {
  id: number;
  number: number;
  nameArabic: string;
  nameEnglish: string;
  englishNameTranslation: string;
  ayahCount: number;
  revelationType: string;
  surahAudioUrl?: string;
  verses: Verse[];
};

export default function DuaQuranView() {
  const [duas, setDuas] = useState<Dua[]>([]);
  const [surahs, setSurahs] = useState<SurahSummary[]>([]);
  const [selectedSurahId, setSelectedSurahId] = useState<number | null>(null);
  const [selectedSurah, setSelectedSurah] = useState<SurahDetail | null>(null);
  const [loadingSurahs, setLoadingSurahs] = useState(true);
  const [loadingSurahDetail, setLoadingSurahDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerses, setShowVerses] = useState(true);

  // Whole-surah playback state
  const [playingSurahId, setPlayingSurahId] = useState<number | null>(null);
  const [currentAyahIdx, setCurrentAyahIdx] = useState(0);
  const surahAudioRef = useRef<HTMLAudioElement | null>(null);
  const singleAyahAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSessionRef = useRef(0);

  // ✅ HARD-LOCK page scroll while this view is mounted
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // Clean-up on unmount
  useEffect(() => {
    return () => {
      stopSurahPlayback();
      stopSingleAyahPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setError(null);

        const [duasRes, surahRes] = await Promise.all([
          apiFetch(`/api/duas`),
          apiFetch(`/api/quran/surahs`),
        ]);

        if (!duasRes.ok) throw new Error(`Duas HTTP ${duasRes.status}`);
        if (!surahRes.ok) throw new Error(`Surahs HTTP ${surahRes.status}`);

        const duasJson = await duasRes.json();
        const surahJson = await surahRes.json();

        setDuas(duasJson.duas || []);
        const list: SurahSummary[] = surahJson.surahs || [];
        setSurahs(list);

        if (list.length > 0) {
          const first = list[0];
          setSelectedSurahId(first.id);
          loadSurahDetail(first.id);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch data. Please try again.");
      } finally {
        setLoadingSurahs(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSurahDetail(id: number) {
    try {
      setLoadingSurahDetail(true);
      setError(null);
      stopSurahPlayback();

      const res = await apiFetch(`/api/quran/surahs/${id}`);
      if (!res.ok) throw new Error(`Surah detail HTTP ${res.status}`);
      const data: SurahDetail = await res.json();

      setSelectedSurah(data);
    } catch (err) {
      console.error(err);
      setError("Could not load that surah. Please try again.");
    } finally {
      setLoadingSurahDetail(false);
    }
  }

  function handleSelectSurah(id: number) {
    if (id === selectedSurahId) return;
    setSelectedSurahId(id);
    loadSurahDetail(id);
  }

  function handlePlayAyah(audioUrl?: string | null) {
    if (!audioUrl) return;

    stopSurahPlayback();
    stopSingleAyahPlayback();

    if (!singleAyahAudioRef.current) singleAyahAudioRef.current = new Audio();

    const audio = singleAyahAudioRef.current;
    audio.onended = null;
    audio.src = audioUrl;

    audio.play().catch((err) => {
      console.error("Failed to play ayah audio", err);
      setError("Audio playback failed. Please try again.");
    });
  }

  function playAyahIndex(idx: number, verses: Verse[], sessionId: number) {
    if (sessionId !== playbackSessionRef.current) return;

    const verse = verses[idx];
    if (!verse || !verse.audioUrl) {
      const nextIdx = idx + 1;
      if (nextIdx < verses.length) {
        setCurrentAyahIdx(nextIdx);
        playAyahIndex(nextIdx, verses, sessionId);
      } else {
        stopSurahPlayback();
      }
      return;
    }

    if (!surahAudioRef.current) surahAudioRef.current = new Audio();

    const audioEl = surahAudioRef.current;
    audioEl.onended = null;
    audioEl.src = verse.audioUrl;

    audioEl.onended = () => {
      if (sessionId !== playbackSessionRef.current) return;

      const nextIdx = idx + 1;
      if (nextIdx < verses.length) {
        setCurrentAyahIdx(nextIdx);
        playAyahIndex(nextIdx, verses, sessionId);
      } else {
        stopSurahPlayback();
      }
    };

    audioEl.play().then(() => setCurrentAyahIdx(idx)).catch((err) => {
      console.error("Failed to play surah audio", err);
      setError("Audio playback failed. Please try again.");
      stopSurahPlayback();
    });
  }

  function togglePlayWholeSurah() {
    if (!selectedSurah || !selectedSurah.verses?.length) return;

    if (playingSurahId === selectedSurah.id) {
      stopSurahPlayback();
      return;
    }

    setPlayingSurahId(selectedSurah.id);
    setCurrentAyahIdx(0);
    const sessionId = ++playbackSessionRef.current;
    playAyahIndex(0, selectedSurah.verses, sessionId);
  }

  function stopSingleAyahPlayback() {
    const a = singleAyahAudioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
      a.onended = null;
    }
  }

  function stopSurahPlayback() {
    playbackSessionRef.current += 1;

    const audioEl = surahAudioRef.current;
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.onended = null;
    }
    setPlayingSurahId(null);
    setCurrentAyahIdx(0);
  }

  const quranSurahs = surahs;

  return (
    // ✅ Viewport-locked container: page can’t grow -> no page scrolling
    <div className="fixed inset-0 bg-slate-950 overflow-hidden">
      <div className="h-full w-full py-6 px-4 md:px-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col min-h-0">
          {/* Top nav */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4 shrink-0">
            <Logo />
            <Navigation />
          </div>

          {/* Header */}
          <header className="mb-4 shrink-0">
            <h1 className="text-3xl md:text-4xl font-semibold text-white mb-2">
              Dua & Qur’an
            </h1>
            <p className="text-slate-300 text-base md:text-lg max-w-2xl">
              Easy to read and listen – perfect for elders or anyone who prefers audio.
            </p>
          </header>

          {error && (
            <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 shrink-0">
              {error}
            </div>
          )}

          {/* Two columns take remaining height */}
          <div className="grid lg:grid-cols-2 gap-6 flex-1 min-h-0">
            {/* LEFT: DUAS */}
            <section className="flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-xl md:text-2xl text-white font-semibold">
                    Duas
                  </h2>
                </div>
                <p className="text-slate-400 text-sm md:text-base mb-3">
                  Short supplications for daily routines, with audio playback.
                </p>
              </div>

              {/* ✅ RED-BOX behavior: scroll only inside this panel */}
              <div className="flex-1 min-h-0 rounded-2xl bg-slate-900/40 border border-slate-800 overflow-hidden">
                <div className="h-full overflow-y-auto overscroll-contain px-4 md:px-5 py-4 space-y-4">
                  {duas.map((dua) => (
                    <div
                      key={dua.id}
                      className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 md:px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-lg md:text-xl font-semibold text-white">
                              {dua.title}
                            </h3>
                            {dua.tags?.map((tag) => (
                              <Badge
                                key={tag}
                                className="bg-slate-800 text-slate-200 border-slate-700 text-xs md:text-[11px]"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>

                          <p className="mt-1 text-2xl md:text-3xl leading-relaxed text-slate-50">
                            {dua.textArabic}
                          </p>

                          {dua.textTransliteration && (
                            <p className="mt-2 text-base md:text-lg text-emerald-100">
                              {dua.textTransliteration}
                            </p>
                          )}

                          <p className="mt-2 text-sm md:text-base text-slate-300">
                            {dua.textTranslation}
                          </p>
                        </div>

                        {dua.audioUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                            onClick={() => handlePlayAyah(`${dua.audioUrl}`)}
                          >
                            <Headphones className="w-4 h-4 mr-1" />
                            Play
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {duas.length === 0 && !loadingSurahs && (
                    <p className="text-slate-500 text-sm">
                      No duas found yet. We’ll add more supplications soon in shā’ Allāh.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* RIGHT: QURAN */}
            <section className="flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-xl md:text-2xl text-white font-semibold">
                    Qur’an
                  </h2>
                </div>
                <p className="text-slate-400 text-sm md:text-base mb-3">
                  Browse any surah with Arabic, transliteration, translation, and audio.
                </p>
              </div>

              {/* ✅ RED-BOX behavior: scroll only inside this panel */}
              <div className="flex-1 min-h-0 rounded-2xl bg-slate-900/40 border border-slate-800 overflow-hidden">
                <div className="h-full overflow-y-auto overscroll-contain px-4 md:px-5 py-4 space-y-4">
                  {loadingSurahs && (
                    <p className="text-slate-400 text-sm">Loading surahs…</p>
                  )}

                  {quranSurahs.map((s) => {
                    const isActive = s.id === selectedSurahId;
                    return (
                      <div
                        key={s.id}
                        className="rounded-2xl bg-slate-900/80 border border-slate-800"
                      >
                        <div className="flex items-center justify-between px-4 md:px-5 py-3">
                          <div
                            className="flex flex-col gap-1 cursor-pointer"
                            onClick={() => handleSelectSurah(s.id)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-slate-400">
                                #{s.number}
                              </span>
                              <span className="text-base md:text-lg text-white font-semibold">
                                {s.nameEnglish}
                              </span>
                              <span className="text-base md:text-lg text-slate-300">
                                ({s.nameArabic})
                              </span>
                            </div>
                            <div className="text-xs md:text-sm text-slate-400">
                              {s.ayahCount} ayat · {s.revelationType}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isActive && selectedSurah && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={togglePlayWholeSurah}
                              >
                                <Play className="w-4 h-4 mr-1" />
                                {playingSurahId === selectedSurah.id ? "Stop" : "Play Surah"}
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-200 bg-slate-800 hover:bg-slate-700"
                              onClick={() => {
                                if (!isActive) handleSelectSurah(s.id);
                                setShowVerses((prev) => (isActive ? !prev : true));
                              }}
                            >
                              {showVerses && isActive ? (
                                <>
                                  <ChevronUp className="w-4 h-4 mr-1" />
                                  Hide
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4 mr-1" />
                                  Show
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        {isActive && selectedSurah && showVerses && (
                          <div className="border-t border-slate-800 px-4 md:px-5 py-4 space-y-4">
                            {loadingSurahDetail && (
                              <p className="text-slate-400 text-sm">
                                Loading surah…
                              </p>
                            )}

                            {!loadingSurahDetail &&
                              selectedSurah.verses.map((v) => {
                                const isCurrentAyah =
                                  playingSurahId === selectedSurah.id &&
                                  selectedSurah.verses[currentAyahIdx]?.numberInSurah ===
                                    v.numberInSurah;

                                return (
                                  <div
                                    key={v.numberInSurah}
                                    className={`rounded-xl px-3 py-3 md:py-4 ${
                                      isCurrentAyah
                                        ? "bg-emerald-500/10 border border-emerald-500/40"
                                        : "bg-slate-900/40 border border-slate-800"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-4 mb-2">
                                      <span className="text-xs md:text-sm text-slate-400">
                                        Ayah {v.numberInSurah}
                                      </span>

                                      {v.audioUrl && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-emerald-400 hover:text-emerald-300 hover:bg-transparent px-2 py-1"
                                          onClick={() => handlePlayAyah(v.audioUrl || undefined)}
                                        >
                                          <Headphones className="w-4 h-4 mr-1" />
                                          Play
                                        </Button>
                                      )}
                                    </div>

                                    <p className="text-2xl md:text-3xl leading-relaxed text-right text-slate-50">
                                      {v.textArabic}
                                    </p>

                                    {v.textTransliteration && (
                                      <p className="mt-2 text-base md:text-lg text-emerald-100">
                                        {v.textTransliteration}
                                      </p>
                                    )}

                                    {v.textTranslation && (
                                      <p className="mt-2 text-sm md:text-base text-slate-300">
                                        {v.textTranslation}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
