import { useEffect, useRef, useState } from "react";

// Mapping languages to standard speech recognition BCP-47 locale tags
export const SPEECH_LANG_MAP = {
  en: { code: "en-US", name: "English (US)" },
  hi: { code: "hi-IN", name: "Hindi (हिन्दी)" },
  te: { code: "te-IN", name: "Telugu (తెలుగు)" },
  ta: { code: "ta-IN", name: "Tamil (தமிழ்)" },
  kn: { code: "kn-IN", name: "Kannada (ಕನ್ನಡ)" },
  ml: { code: "ml-IN", name: "Malayalam (മലയാളം)" },
  bn: { code: "bn-IN", name: "Bengali (বাংলা)" },
  mr: { code: "mr-IN", name: "Marathi (मराठी)" },
  gu: { code: "gu-IN", name: "Gujarati (ગુજરાતી)" },
  ur: { code: "ur-IN", name: "Urdu (اردو)" },
};

export default function VoiceMic({ onTranscript, selectedLanguage = "en", disabled = false }) {
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      // Set target locale based on selected app language or fallback to en-US
      const targetLocale = SPEECH_LANG_MAP[selectedLanguage]?.code || "en-US";
      recognition.lang = targetLocale;

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText("");
      };

      recognition.onresult = (event) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          setInterimText(interim);
        }

        if (final) {
          setInterimText("");
          onTranscript(final);
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
        setInterimText("");
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText("");
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Speech recognition initialization failed:", err);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [selectedLanguage, onTranscript]);

  const toggleListening = () => {
    if (disabled || !speechSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        const targetLocale = SPEECH_LANG_MAP[selectedLanguage]?.code || "en-US";
        if (recognitionRef.current) {
          recognitionRef.current.lang = targetLocale;
          recognitionRef.current.start();
        }
      } catch (err) {
        console.error("Could not start speech recognition:", err);
      }
    }
  };

  const currentLangLabel = SPEECH_LANG_MAP[selectedLanguage]?.name || "English";

  if (!speechSupported) {
    return null;
  }

  return (
    <div className="voice-mic-container">
      {isListening && interimText && (
        <div className="voice-interim-bubble" title="Listening...">
          <span className="voice-wave-dot" />
          <span className="voice-interim-text">{interimText}</span>
        </div>
      )}
      <button
        type="button"
        className={`voice-mic-btn ${isListening ? "listening" : ""}`}
        onClick={toggleListening}
        disabled={disabled}
        title={
          isListening
            ? "Listening in " + currentLangLabel + "... Click to stop"
            : "Click to speak in " + currentLangLabel
        }
        aria-label={
          isListening
            ? "Stop microphone"
            : "Activate microphone for voice input in " + currentLangLabel
        }
      >
        {isListening ? (
          <span className="mic-pulse-ring" />
        ) : null}
        <svg
          className="mic-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>
    </div>
  );
}
