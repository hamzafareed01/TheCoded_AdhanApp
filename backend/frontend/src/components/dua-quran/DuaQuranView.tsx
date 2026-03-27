import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Headphones,
  Play,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Logo } from "../shared/Logo";
import { Navigation } from "../shared/Navigation";
import { apiFetch } from "../../lib/api";

type JsonRecord = Record<string, unknown>;

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
  number: number;
  nameArabic: string;
  nameEnglish: string;
  englishNameTranslation: string;
  ayahCount: number;
  revelationType: string;
  surahAudioUrl?: string;
  verses: Verse[];
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeDuas(payload: unknown): Dua[] {
  if (!isRecord(payload) || !Array.isArray(payload.categories)) return [];

  const out: Dua[] = [];

  for (const category of payload.categories) {
    if (!isRecord(category) || !Array.isArray(category.items)) continue;

    const categoryTitle = asString(category.title) ?? asString(category.name) ?? "Dua";

    for (const item of category.items) {
      if (!isRecord(item)) continue;

      const id = asString(item.id);
      const title = asString(item.title);
      const textArabic =
        asString(item.textArabic) ?? asString(item.arabic) ?? asString(item.text_arabic);
      const textTranslation =
        asString(item.textTranslation) ??
        asString(item.translation) ??
        asString(item.text_translation);

      if (!id || !title || !textArabic || !textTranslation) continue;

      out.push({
        id,
        category: categoryTitle,
        title,
        textArabic,
        textTransliteration:
          asString(item.textTransliteration) ??
          asString(item.transliteration) ??
          asString(item.text_transliteration) ??
          undefined,
        textTranslation,
        audioUrl:
          asString(item.audioUrl) ?? asString(item.audio_url) ?? asString(item.audio) ?? undefined,
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === "string")
          : undefined,
      });
    }
  }

  return out;
}

function normalizeSurahSummaries(payload: unknown): SurahSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.surahs)) return [];

  return payload.surahs
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      number: asNumber(item.number) ?? NaN,
      nameArabic: asString(item.nameArabic) ?? asString(item.name) ?? "",
      nameEnglish: asString(item.nameEnglish) ?? "",
      englishNameTranslation:
        asString(item.englishNameTranslation) ??
        asString(item.translationEnglish) ??
        "",
      ayahCount: asNumber(item.ayahCount) ?? asNumber(item.ayahs) ?? 0,
      revelationType: asString(item.revelationType) ?? "",
    }))
    .filter(
      (item) =>
        Number.isFinite(item.number) && item.number >= 1 && item.nameArabic && item.nameEnglish
    );
}

function normalizeSurahDetail(payload: unknown): SurahDetail | null {
  const root = isRecord(payload) ? payload : {};
  const src = isRecord(root.surah) ? root.surah : root;
  if (!isRecord(src)) return null;

  const ayahs = Array.isArray(src.ayahs) ? src.ayahs : Array.isArray(src.verses) ? src.verses : [];
  const verses: Verse[] = ayahs
    .filter((item): item is JsonRecord => isRecord(item))
    .map((item) => ({
      numberInSurah: asNumber(item.numberInSurah) ?? NaN,
      textArabic: asString(item.textArabic) ?? asString(item.arabic) ?? asString(item.text) ?? "",
      textTranslation:
        asString(item.textTranslation) ?? asString(item.translation) ?? null,
      textTransliteration:
        asString(item.textTransliteration) ?? asString(item.transliteration) ?? null,
      audioUrl: asString(item.audioUrl) ?? asString(item.audio) ?? null,
      audioVariants: Array.isArray(item.audioVariants)
        ? item.audioVariants.filter((v): v is string => typeof v === "string")
        : undefined,
    }))
    .filter((item) => Number.isFinite(item.numberInSurah) && !!item.textArabic);

  const number = asNumber(src.number);
  const nameArabic = asString(src.nameArabic) ?? asString(src.name);
  const nameEnglish = asString(src.nameEnglish);

  if (!number || !nameArabic || !nameEnglish) {
    return null;
  }

  return {
    number,
    nameArabic,
    nameEnglish,
    englishNameTranslation:
      asString(src.englishNameTranslation) ?? asString(src.translationEnglish) ?? "",
    ayahCount: verses.length || asNumber(src.ayahCount) || 0,
    revelationType: asString(src.revelationType) ?? "",
    surahAudioUrl: asString(src.surahAudioUrl) ?? undefined,
    verses,
  };
}

function includesQuery(parts: Array<string | undefined | null>, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((part) => String(part || "").toLowerCase().includes(q));
}

export default function DuaQuranView() {
  const [duas, setDuas] = useState<Dua[]>([]);
  const [surahs, setSurahs] = useState<SurahSummary[]>([]);
  const [selectedSurahId, setSelectedSurahId] = useState<number | null>(null);
  const [selectedSurah, setSelectedSurah] = useState<SurahDetail | null>(null);
  const [loadingSurahs, setLoadingSurahs] = useState(true);
  const [loadingSurahDetail, setLoadingSurahDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerses, setShowVerses] = useState(true);
  const [duaQuery, setDuaQuery] = useState("");
  const [quranQuery, setQuranQuery] = useState("");
  const [verseQuery, setVerseQuery] = useState("");

  const [playingSurahId, setPlayingSurahId] = useState<number | null>(null);
  const [currentAyahIdx, setCurrentAyahIdx] = useState(0);
  const surahAudioRef = useRef<HTMLAudioElement | null>(null);
  const singleAyahAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSessionRef = useRef(0);

  
  useEffect(() => {
    return () => {
      stopSurahPlayback();
      stopSingleAyahPlayback();
    };
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

        setDuas(normalizeDuas(duasJson));
        const list = normalizeSurahSummaries(surahJson);
        setSurahs(list);

        if (list.length > 0) {
          const first = list[0];
          setSelectedSurahId(first.number);
          await loadSurahDetail(first.number);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch data. Please try again.");
      } finally {
        setLoadingSurahs(false);
      }
    }

    void load();
  }, []);

  async function loadSurahDetail(id: number) {
    if (!Number.isFinite(id) || id < 1) return;

    try {
      setLoadingSurahDetail(true);
      setError(null);
      stopSurahPlayback();

      const res = await apiFetch(`/api/quran/surahs/${id}`);
      if (!res.ok) throw new Error(`Surah detail HTTP ${res.status}`);
      const data = normalizeSurahDetail(await res.json());
      if (!data) throw new Error("Invalid surah detail payload.");

      setSelectedSurah(data);
      setVerseQuery("");
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
    void loadSurahDetail(id);
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

    if (playingSurahId === selectedSurah.number) {
      stopSurahPlayback();
      return;
    }

    setPlayingSurahId(selectedSurah.number);
    setCurrentAyahIdx(0);
    const sessionId = ++playbackSessionRef.current;
    const versesToPlay = filteredVerses.length > 0 ? filteredVerses : selectedSurah.verses;
    playAyahIndex(0, versesToPlay, sessionId);
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

  const filteredDuas = useMemo(
    () =>
      duas.filter((dua) =>
        includesQuery(
          [
            dua.category,
            dua.title,
            dua.textArabic,
            dua.textTransliteration,
            dua.textTranslation,
            ...(dua.tags || []),
          ],
          duaQuery
        )
      ),
    [duas, duaQuery]
  );

  const filteredSurahs = useMemo(
    () =>
      surahs.filter((surah) =>
        includesQuery(
          [
            String(surah.number),
            surah.nameEnglish,
            surah.nameArabic,
            surah.englishNameTranslation,
            surah.revelationType,
          ],
          quranQuery
        )
      ),
    [surahs, quranQuery]
  );

  const filteredVerses = useMemo(() => {
    if (!selectedSurah) return [];
    return selectedSurah.verses.filter((verse) =>
      includesQuery(
        [
          String(verse.numberInSurah),
          verse.textArabic,
          verse.textTransliteration,
          verse.textTranslation,
        ],
        verseQuery
      )
    );
  }, [selectedSurah, verseQuery]);

  const duaAudioNote = useMemo(
    () => duas.some((dua) => !!dua.audioUrl),
    [duas]
  );

  return (
    <div className="h-screen overflow-hidden bg-slate-950">
      <div className="w-full h-full py-4 px-4 md:px-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4 shrink-0">
            <Logo />
            <Navigation />
          </div>

          <header className="mb-4 shrink-0">
            <h1 className="text-3xl md:text-4xl font-semibold text-white mb-2">
              Dua &amp; Qur’an
            </h1>
            <p className="text-slate-300 text-base md:text-lg max-w-3xl">
              Search daily duas and browse the Qur’an with a fixed background and scrollable reading panels. Only the After Adhan dua uses dedicated dua audio here.
            </p>
          </header>

          {error && (
            <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 shrink-0">
              {error}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
            <section className="flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-xl md:text-2xl text-white font-semibold">
                    Duas
                  </h2>
                </div>
                <p className="text-slate-400 text-sm md:text-base mb-3">
                  Search by title, category, Arabic text, transliteration, translation, or tags.
                </p>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    value={duaQuery}
                    onChange={(e) => setDuaQuery(e.target.value)}
                    placeholder="Search duas, keywords, or daily routine..."
                    className="pl-10 bg-slate-900 border-slate-700 text-slate-100"
                  />
                </div>
                {duaAudioNote && (
                  <p className="text-xs text-slate-500 mb-3">
                    Audio buttons appear only for duas that have mapped audio files.
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-900/40 border border-slate-800 overflow-hidden h-[calc(100vh-270px)] lg:h-full">
                <div className="h-full overflow-y-auto overscroll-contain px-4 md:px-5 py-4 space-y-4">
                  {filteredDuas.map((dua) => (
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
                            <Badge className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs">
                              {dua.category}
                            </Badge>
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
                            onClick={() => handlePlayAyah(dua.audioUrl)}
                          >
                            <Headphones className="w-4 h-4 mr-1" />
                            Play
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredDuas.length === 0 && !loadingSurahs && (
                    <p className="text-slate-500 text-sm">
                      No duas matched your search.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-xl md:text-2xl text-white font-semibold">
                    Qur’an
                  </h2>
                </div>
                <p className="text-slate-400 text-sm md:text-base mb-3">
                  Search surah names first, then optionally search inside the selected surah’s ayat.
                </p>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    value={quranQuery}
                    onChange={(e) => setQuranQuery(e.target.value)}
                    placeholder="Search surah by number, English name, Arabic name..."
                    className="pl-10 bg-slate-900 border-slate-700 text-slate-100"
                  />
                </div>
                {selectedSurah && showVerses && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={verseQuery}
                      onChange={(e) => setVerseQuery(e.target.value)}
                      placeholder={`Search inside ${selectedSurah.nameEnglish}...`}
                      className="pl-10 bg-slate-900 border-slate-700 text-slate-100"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-slate-900/40 border border-slate-800 overflow-hidden h-[calc(100vh-270px)] lg:h-full">
                <div className="h-full overflow-y-auto overscroll-contain px-4 md:px-5 py-4 space-y-4">
                  {loadingSurahs && (
                    <p className="text-slate-400 text-sm">Loading surahs…</p>
                  )}

                  {!loadingSurahs && filteredSurahs.length === 0 && (
                    <p className="text-slate-500 text-sm">No surahs matched your search.</p>
                  )}

                  {filteredSurahs.map((s) => {
                    const isActive = s.number === selectedSurahId;
                    return (
                      <div
                        key={s.number}
                        className="rounded-2xl bg-slate-900/80 border border-slate-800"
                      >
                        <div className="flex items-center justify-between px-4 md:px-5 py-3 gap-3">
                          <div
                            className="flex flex-col gap-1 cursor-pointer"
                            onClick={() => handleSelectSurah(s.number)}
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
                              {s.englishNameTranslation ? ` · ${s.englishNameTranslation}` : ""}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isActive && selectedSurah && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={togglePlayWholeSurah}
                              >
                                <Play className="w-4 h-4 mr-1" />
                                {playingSurahId === selectedSurah.number ? "Stop" : "Play Surah"}
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-200 bg-slate-800 hover:bg-slate-700"
                              onClick={() => {
                                if (!isActive) handleSelectSurah(s.number);
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

                            {!loadingSurahDetail && filteredVerses.length === 0 && (
                              <p className="text-slate-500 text-sm">
                                No ayat matched your verse search.
                              </p>
                            )}

                            {!loadingSurahDetail &&
                              filteredVerses.map((v) => {
                                const activeVerse = filteredVerses[currentAyahIdx];
                                const isCurrentAyah =
                                  playingSurahId === selectedSurah.number &&
                                  activeVerse?.numberInSurah === v.numberInSurah;

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
                                          onClick={() => handlePlayAyah(v.audioUrl)}
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
