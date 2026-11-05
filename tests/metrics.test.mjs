import test from "node:test";
import assert from "node:assert/strict";
import { countEnglishWords, wordsPerMinute, summarizeSpeech, livePaceCue, localSuggestions } from "../src/ai/metrics.ts";

test("English word counting handles punctuation and contractions", () => {
  assert.equal(countEnglishWords("Hello, we're ready. 2026!"), 4);
  assert.equal(countEnglishWords(""), 0);
});
test("WPM avoids misleading results for tiny samples", () => {
  assert.equal(wordsPerMinute(3, 60), null);
  assert.equal(wordsPerMinute(10, 0), null);
  assert.equal(wordsPerMinute(60, 30), 120);
});
test("per-section metrics assign recognized speech only to its section", () => {
  const result = summarizeSpeech(
    [
      { sectionId: 1, text: "Hello everyone welcome to our pitch", atSecond: 5 },
      { sectionId: 2, text: "Now our next section begins here", atSecond: 25 },
    ],
    [
      { id: 1, name: "Intro", target: 20, actual: 20 },
      { id: 2, name: "Pitch", target: 20, actual: 20 },
    ],
    40,
  );
  assert.equal(result.words, 12);
  assert.equal(result.sections[0].words, 6);
  assert.equal(result.sections[1].words, 6);
  assert.equal(result.wpm, 18);
});
test("cues prioritize upcoming target and over-target state", () => {
  assert.match(livePaceCue({ target: 30, sectionElapsed: 25, sectionWords: 20 }), /Wrap up/);
  assert.match(livePaceCue({ target: 30, sectionElapsed: 30, sectionWords: 20 }), /Over section/);
  assert.equal(livePaceCue({ target: 30, sectionElapsed: 2, sectionWords: 0 }), null);
});
test("local report does not invent suggestions without captured speech", () => {
  assert.match(localSuggestions({ words: 0, wpm: null, sections: [] })[0], /No speech/);
});
