const LANGUAGES = new Set([
  "en",
  "hi",
  "te",
  "ta",
  "kn",
  "ml",
  "bn",
  "mr",
  "gu",
  "ur",
]);

const COMBO_POLL_INTERVAL = 200;
const COMBO_POLL_TIMEOUT = 5000;

function readGoogleTranslateCookie() {
  const matchingCookies = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith("googtrans="));

  const value = matchingCookies.at(-1)?.slice("googtrans=".length) || "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function historyIsPersisted() {
  try {
    const savedChats = localStorage.getItem("kb_chats_v1");
    return Boolean(savedChats && Array.isArray(JSON.parse(savedChats)));
  } catch (error) {
    console.warn("Could not read saved chat history before reloading.", error);
    return false;
  }
}

function writeLanguageCookie(code) {
  const value = `/en/${code}`;
  document.cookie = `googtrans=${value}; path=/; SameSite=Lax`;
  if (window.location.hostname) {
    document.cookie = `googtrans=${value}; path=/; domain=${window.location.hostname}; SameSite=Lax`;
  }
}

function clearLanguageCookie() {
  const expired = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = expired;
  if (window.location.hostname) {
    document.cookie = `${expired}; domain=${window.location.hostname}`;
  }
}

async function waitForCombo() {
  const deadline = Date.now() + COMBO_POLL_TIMEOUT;
  while (Date.now() <= deadline) {
    const combo = document.querySelector(".goog-te-combo");
    if (combo) return combo;
    await new Promise((resolve) => window.setTimeout(resolve, COMBO_POLL_INTERVAL));
  }
  return null;
}

function dispatchLanguageChange(combo, code) {
  combo.value = code;
  combo.dispatchEvent(new Event("change", { bubbles: true }));
}

function showFallbackOrReload(code) {
  writeLanguageCookie(code);
  if (historyIsPersisted()) {
    window.location.reload();
    return { available: true, reloading: true };
  }
  return {
    available: false,
    reloading: false,
    message: "Translation is unavailable. Check your internet connection or ad blocker.",
  };
}

function translatedContentRemains() {
  return Boolean(document.querySelector("#root font"));
}

export function getLang() {
  const cookieValue = readGoogleTranslateCookie();
  const match = cookieValue.match(/^\/[^/]+\/([^/]+)$/);
  const code = match?.[1] || "en";
  return LANGUAGES.has(code) ? code : "en";
}

export async function setLanguage(code) {
  if (!LANGUAGES.has(code)) {
    throw new Error(`Unsupported translation language: ${code}`);
  }

  const combo = await waitForCombo();
  if (!combo) {
    if (code !== "en") return showFallbackOrReload(code);
    clearLanguageCookie();
    if (historyIsPersisted()) {
      window.location.reload();
      return { available: true, reloading: true };
    }
    return {
      available: false,
      reloading: false,
      message: "Translation is unavailable. Check your internet connection or ad blocker.",
    };
  }

  dispatchLanguageChange(combo, code);
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  if (code === "en" && translatedContentRemains()) {
    clearLanguageCookie();
    if (historyIsPersisted()) {
      window.location.reload();
      return { available: true, reloading: true };
    }
    return {
      available: false,
      reloading: false,
      message: "Translation is unavailable. Check your internet connection or ad blocker.",
    };
  }

  return { available: true, reloading: false };
}

export async function retranslate() {
  const savedLanguage = getLang();
  if (savedLanguage === "en") return { available: true, reloading: false };

  const combo = await waitForCombo();
  if (!combo) {
    return showFallbackOrReload(savedLanguage);
  }

  dispatchLanguageChange(combo, "en");
  await new Promise((resolve) => window.setTimeout(resolve, 500));
  let targetCombo =
    document.querySelector(".goog-te-combo") || (await waitForCombo());
  if (!targetCombo) {
    return showFallbackOrReload(savedLanguage);
  }
  dispatchLanguageChange(targetCombo, savedLanguage);
  await new Promise((resolve) => window.setTimeout(resolve, 500));

  targetCombo = document.querySelector(".goog-te-combo") || targetCombo;
  if (targetCombo.value !== savedLanguage) {
    dispatchLanguageChange(targetCombo, savedLanguage);
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  if (getLang() !== savedLanguage) {
    writeLanguageCookie(savedLanguage);
  }
  return { available: true, reloading: false };
}
