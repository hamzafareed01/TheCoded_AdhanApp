import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Headphones,
  Play,
  ChevronDown,
  ChevronUp,
  Search,
  Heart,
  Pause,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
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
  const [activeTab, setActiveTab] = useState("dua");
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
    <div className="min-h-screen bg-slate-950 overscroll-none">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Logo />
            <Navigation />
          </div>
        </div>
      </div>
 
      <div className="max-w-7xl mx-auto px-4 py-5 md:px-6 md:py-6" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900 border border-emerald-500/20 p-6 md:p-8 mb-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_60%)]" />
          
          <div className="relative flex items-start justify-between gap-6 flex-col md:flex-row">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5">
                  <BookOpen className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-white text-2xl md:text-3xl font-semibold">
                    Dua & Qur'an
                  </h1>
                </div>
              </div>
              <p className="text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
                Daily supplications and selected verses from the Holy Qur'an. 
                Enhance your spiritual connection through remembrance and recitation.
              </p>
            </div>
          </div>
        </div>
 
        {/* Error Alert */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
 
        {/* Main Tabbed Content Card */}
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Tab Navigation */}
            <div className="border-b border-slate-800/60 bg-slate-900/60 backdrop-blur-sm">
              <TabsList className="bg-transparent border-0 w-full justify-start h-auto p-0">
                <TabsTrigger 
                  value="dua" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-400 data-[state=active]:shadow-[inset_0_-2px_0_0_rgb(52,211,153)] data-[state=inactive]:text-slate-400 rounded-none px-6 md:px-8 py-4 text-base font-medium transition-all min-h-[48px] touch-manipulation"
                >
                  Daily Duas
                </TabsTrigger>
                <TabsTrigger 
                  value="quran" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-400 data-[state=active]:shadow-[inset_0_-2px_0_0_rgb(52,211,153)] data-[state=inactive]:text-slate-400 rounded-none px-6 md:px-8 py-4 text-base font-medium transition-all min-h-[48px] touch-manipulation"
                >
                  Qur'an
                </TabsTrigger>
              </TabsList>
            </div>
 
            {/* Dua Tab Content */}
            <TabsContent value="dua" className="p-0 m-0">
              <div className="p-4 md:p-6">
                {/* Search Bar */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={duaQuery}
                      onChange={(e) => setDuaQuery(e.target.value)}
                      placeholder="Search duas by title, category, Arabic text, or tags..."
                      className="pl-10 bg-slate-900/60 border-slate-700 text-slate-100 h-11"
                    />
                  </div>
                  {duaAudioNote && (
                    <p className="text-xs text-slate-500 mt-2">
                      Audio buttons appear only for duas with available audio.
                    </p>
                  )}
                </div>
 
                {/* Scrollable Dua List */}
                <div className="max-h-[70vh] overflow-y-auto overscroll-contain space-y-4 pr-1">
                  {filteredDuas.map((dua) => (
                    <div
                      key={dua.id}
                      className="group rounded-2xl border border-slate-800/60 bg-slate-900/60 backdrop-blur-sm p-5 md:p-6 hover:border-slate-700/60 hover:bg-slate-900/80 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60"></div>
                            <h3 className="text-white font-medium text-base md:text-lg">
                              {dua.title}
                            </h3>
                            <Badge className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs">
                              {dua.category}
                            </Badge>
                            {dua.tags?.map((tag) => (
                              <Badge
                                key={tag}
                                className="bg-slate-800/60 text-slate-300 border-slate-700/60 text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {dua.audioUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/40 flex-shrink-0 min-h-[44px] touch-manipulation"
                            onClick={() => handlePlayAyah(dua.audioUrl)}
                          >
                            <Headphones className="w-3.5 h-3.5 mr-1.5" />
                            <span className="hidden sm:inline">Play</span>
                          </Button>
                        )}
                      </div>
                      
                      <div className="mb-5 p-5 rounded-xl bg-slate-950/50 border border-slate-800/40">
                        <div className="text-right" dir="rtl">
                          <p className="text-white text-2xl md:text-3xl leading-loose">
                            {dua.textArabic}
                          </p>
                        </div>
                      </div>
                      
                      {dua.textTransliteration && (
                        <div className="mb-4 pb-4 border-b border-slate-800/40">
                          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 font-medium">
                            Transliteration
                          </div>
                          <p className="text-emerald-100 text-sm md:text-base italic leading-relaxed">
                            {dua.textTransliteration}
                          </p>
                        </div>
                      )}
                      
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 font-medium">
                          Translation
                        </div>
                        <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                          {dua.textTranslation}
                        </p>
                      </div>
                    </div>
                  ))}
 
                  {filteredDuas.length === 0 && !loadingSurahs && (
                    <div className="flex flex-col items-center justify-center py-16 px-4">
                      <div className="rounded-xl bg-slate-800/50 p-4 mb-4">
                        <Heart className="w-8 h-8 text-slate-500" />
                      </div>
                      <p className="text-slate-400 text-sm text-center">
                        No duas matched your search.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
 
            {/* Qur'an Tab Content */}
            <TabsContent value="quran" className="p-0 m-0">
              <div className="p-4 md:p-6">
                {/* Search Bars */}
                <div className="mb-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={quranQuery}
                      onChange={(e) => setQuranQuery(e.target.value)}
                      placeholder="Search surah by number, English name, Arabic name..."
                      className="pl-10 bg-slate-900/60 border-slate-700 text-slate-100 h-11"
                    />
                  </div>
                  {selectedSurah && showVerses && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        value={verseQuery}
                        onChange={(e) => setVerseQuery(e.target.value)}
                        placeholder={`Search inside ${selectedSurah.nameEnglish}...`}
                        className="pl-10 bg-slate-900/60 border-slate-700 text-slate-100 h-11"
                      />
                    </div>
                  )}
                </div>
 
                {/* Scrollable Surah List */}
                <div className="max-h-[70vh] overflow-y-auto overscroll-contain space-y-3 pr-1">
                  {loadingSurahs && (
                    <p className="text-slate-400 text-sm">Loading surahs...</p>
                  )}
 
                  {!loadingSurahs && filteredSurahs.length === 0 && (
                    <p className="text-slate-500 text-sm">No surahs matched your search.</p>
                  )}
 
                  {filteredSurahs.map((s) => {
                    const isActive = s.number === selectedSurahId;
                    return (
                      <div
                        key={s.number}
                        className="rounded-2xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-sm overflow-hidden hover:border-slate-700/60 hover:bg-slate-900/80 transition-all"
                      >
                        <div className="flex items-center justify-between px-4 md:px-5 py-4 gap-3">
                          <div
                            className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 min-h-[60px] touch-manipulation"
                            onClick={() => handleSelectSurah(s.number)}
                          >
                            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center">
                              <span className="text-emerald-400 font-semibold text-base">
                                {s.number}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-white font-semibold text-base md:text-lg truncate">
                                  {s.nameEnglish}
                                </span>
                                <span className="text-slate-400 text-sm">({s.nameArabic})</span>
                              </div>
                              <div className="text-xs text-slate-500">
                                {s.ayahCount} ayat · {s.revelationType}
                                {s.englishNameTranslation && ` · ${s.englishNameTranslation}`}
                              </div>
                            </div>
                          </div>
 
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isActive && selectedSurah && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] touch-manipulation active:bg-emerald-800"
                                onClick={togglePlayWholeSurah}
                              >
                                {playingSurahId === selectedSurah.number ? (
                                  <>
                                    <Pause className="w-4 h-4 mr-1" />
                                    <span className="hidden sm:inline">Stop</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    <span className="hidden sm:inline">Play</span>
                                  </>
                                )}
                              </Button>
                            )}
 
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700/60 text-slate-200 bg-slate-800/40 hover:bg-slate-800/80 min-h-[44px] touch-manipulation active:bg-slate-800"
                              onClick={() => {
                                if (!isActive) handleSelectSurah(s.number);
                                setShowVerses((prev) => (isActive ? !prev : true));
                              }}
                            >
                              {showVerses && isActive ? (
                                <>
                                  <ChevronUp className="w-4 h-4 mr-1" />
                                  <span className="hidden sm:inline">Hide</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4 mr-1" />
                                  <span className="hidden sm:inline">Show</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
 
                        {isActive && selectedSurah && showVerses && (
                          <div className="border-t border-slate-800/60 px-4 md:px-5 py-4 space-y-3 bg-slate-950/30">
                            {loadingSurahDetail && (
                              <p className="text-slate-400 text-sm">
                                Loading verses...
                              </p>
                            )}
 
                            {!loadingSurahDetail && filteredVerses.length === 0 && (
                              <p className="text-slate-500 text-sm">
                                No verses matched your search.
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
                                    className={`rounded-xl px-4 py-4 ${
                                      isCurrentAyah
                                        ? "bg-emerald-500/10 border border-emerald-500/40"
                                        : "bg-slate-900/40 border border-slate-800/40"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                      <span className="text-xs text-slate-500">
                                        Ayah {v.numberInSurah}
                                      </span>
 
                                      {v.audioUrl && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-3 py-2 min-h-[44px] touch-manipulation"
                                          onClick={() => handlePlayAyah(v.audioUrl)}
                                        >
                                          <Headphones className="w-3.5 h-3.5 mr-1" />
                                          Play
                                        </Button>
                                      )}
                                    </div>
 
                                    <div className="text-right" dir="rtl">
                                      <p className="text-white text-xl md:text-2xl leading-relaxed mb-3">
                                        {v.textArabic}
                                      </p>
                                    </div>
 
                                    {v.textTransliteration && (
                                      <p className="text-emerald-100 text-sm italic mb-2">
                                        {v.textTransliteration}
                                      </p>
                                    )}
 
                                    {v.textTranslation && (
                                      <p className="text-slate-300 text-sm leading-relaxed">
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
            </TabsContent>
          </Tabs>
        </div>
 
        {/* Footer Note */}
        <div className="mt-6 rounded-2xl border border-slate-800/40 bg-slate-900/20 backdrop-blur-sm px-5 py-4">
          <p className="text-slate-400 text-xs md:text-sm leading-relaxed text-center">
            These supplications and verses are provided for spiritual benefit. 
            Recite with sincerity and understanding. May Allah accept your worship.
          </p>
        </div>
      </div>
    </div>
  );
}