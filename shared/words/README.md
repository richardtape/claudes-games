# Word lists

Built by `npm run words` (`scripts/build-words.mjs`) from the raw files in `src/`, which are
gitignored and downloaded automatically when missing (URLs in the script).

| File | What | Use for |
|---|---|---|
| `dictionary.txt` | 168,551 ENABLE words, 2–15 letters, alphabetical | Validating what the player typed |
| `common.txt` | ~78k ENABLE words ranked by Google web frequency, profanity removed | Choosing targets, hints, "best word" suggestions. Top 5k ≈ everyday words; top 20k ≈ words most adults know |

Sources (in `src/`):

- `enable1.txt` — ENABLE2K word list, public domain (via github.com/dolph/dictionary).
- `count_1w.txt` — Peter Norvig's unigram counts from the Google Web Trillion Word Corpus (norvig.com/ngrams), MIT licensed.
- `blocklist-ldnoobw.txt` — LDNOOBW "naughty words" list (CC-BY 4.0), used only to filter `common.txt`.

`dictionary.txt` is deliberately unfiltered: players may type any real word. Never *suggest* a word that isn't in `common.txt`.
