/**
 * Buyer-question templates per language.
 *
 * Switzerland has four national languages and buyers prompt in their own. A
 * Zurich tradesman can be invisible in German while looking healthy in English,
 * and the two measurements are genuinely different: the assistant retrieves
 * different sources and returns different shortlists per language. Auditing
 * only in English measures the wrong market.
 *
 * Placeholders: {cat} category, {loc} location, {aud} audience, {brand} brand
 * name, {comp} competitor name, {comps} competitor list.
 * @module prompts/templates
 */

/** @typedef {'en'|'de'|'fr'|'it'} Lang */

export const LANGUAGES = {
  en: { label: 'English', and: 'and' },
  de: { label: 'German', and: 'und' },
  fr: { label: 'French', and: 'et' },
  it: { label: 'Italian', and: 'e' },
};

/**
 * @type {Record<Lang, Record<string, string[]>>}
 */
export const TEMPLATES = {
  en: {
    commercial_investigation: [
      'What are the best options for {cat} right now?',
      'Who are the top providers of {cat}?',
      'I need {cat}. What do you recommend and why?',
      'What is the best {cat} for {aud}?',
      'Which companies are most trusted for {cat}?',
    ],
    local: [
      'Who offers the best {cat} in {loc}?',
      'I need {cat} in {loc} today. Who should I call?',
      'Which providers of {cat} near {loc} have the best reviews?',
    ],
    comparison: [
      '{brand} vs {comp}: which is better and for whom?',
      'How do the leading providers of {cat} compare on quality and price?',
    ],
    alternative: [
      'What are the best alternatives to {comp}?',
      'What should I use instead of the biggest name in {cat}?',
    ],
    pricing: [
      'How much does {cat} typically cost?',
      'What is a fair price to pay for {cat} in {loc}?',
    ],
    problem: [
      'What should I look for when hiring for {cat}?',
      'What are the most common mistakes people make when buying {cat}?',
    ],
    branded: [
      'What is {brand} and what do they do?',
      'Is {brand} any good? What do reviews say?',
    ],
  },
  de: {
    commercial_investigation: [
      'Was sind aktuell die besten Anbieter für {cat}?',
      'Wer sind die führenden Anbieter für {cat}?',
      'Ich brauche {cat}. Was empfiehlst du und warum?',
      'Welcher Anbieter für {cat} eignet sich am besten für {aud}?',
      'Welchen Firmen für {cat} wird am meisten vertraut?',
    ],
    local: [
      'Wer bietet {cat} in {loc} an?',
      'Ich brauche heute {cat} in {loc}. Wen soll ich anrufen?',
      'Welche Anbieter für {cat} in der Nähe von {loc} haben die besten Bewertungen?',
    ],
    comparison: [
      '{brand} oder {comp}: Was ist besser und für wen?',
      'Wie schneiden die führenden Anbieter für {cat} bei Qualität und Preis ab?',
    ],
    alternative: [
      'Was sind gute Alternativen zu {comp}?',
      'Welche Alternative gibt es zum grössten Anbieter für {cat}?',
    ],
    pricing: [
      'Was kostet {cat} üblicherweise?',
      'Was ist ein fairer Preis für {cat} in {loc}?',
    ],
    problem: [
      'Worauf sollte ich bei der Auswahl von {cat} achten?',
      'Welche Fehler macht man häufig beim Kauf von {cat}?',
    ],
    branded: [
      'Was ist {brand} und was machen sie?',
      'Ist {brand} zu empfehlen? Was sagen die Bewertungen?',
    ],
  },
  fr: {
    commercial_investigation: [
      'Quelles sont les meilleures options pour {cat} actuellement ?',
      'Qui sont les principaux prestataires de {cat} ?',
      "J'ai besoin de {cat}. Que recommandes-tu et pourquoi ?",
      'Quel prestataire de {cat} convient le mieux à {aud} ?',
      'À quelles entreprises fait-on le plus confiance pour {cat} ?',
    ],
    local: [
      'Qui propose {cat} à {loc} ?',
      "J'ai besoin de {cat} à {loc} aujourd'hui. Qui dois-je appeler ?",
      'Quels prestataires de {cat} près de {loc} ont les meilleurs avis ?',
    ],
    comparison: [
      '{brand} ou {comp} : lequel est le meilleur et pour qui ?',
      'Comment se comparent les principaux prestataires de {cat} en qualité et en prix ?',
    ],
    alternative: [
      'Quelles sont les meilleures alternatives à {comp} ?',
      'Que puis-je utiliser à la place du plus grand nom en {cat} ?',
    ],
    pricing: [
      'Combien coûte généralement {cat} ?',
      'Quel est un prix correct pour {cat} à {loc} ?',
    ],
    problem: [
      'À quoi faut-il faire attention en choisissant {cat} ?',
      'Quelles sont les erreurs les plus fréquentes lors de l\'achat de {cat} ?',
    ],
    branded: [
      "Qu'est-ce que {brand} et que font-ils ?",
      'Est-ce que {brand} est recommandable ? Que disent les avis ?',
    ],
  },
  it: {
    commercial_investigation: [
      'Quali sono le migliori opzioni per {cat} in questo momento?',
      'Chi sono i principali fornitori di {cat}?',
      'Ho bisogno di {cat}. Cosa consigli e perché?',
      'Quale fornitore di {cat} è più adatto a {aud}?',
      'Di quali aziende ci si fida di più per {cat}?',
    ],
    local: [
      'Chi offre {cat} a {loc}?',
      'Ho bisogno di {cat} a {loc} oggi. Chi devo chiamare?',
      'Quali fornitori di {cat} vicino a {loc} hanno le recensioni migliori?',
    ],
    comparison: [
      '{brand} o {comp}: quale è meglio e per chi?',
      'Come si confrontano i principali fornitori di {cat} per qualità e prezzo?',
    ],
    alternative: [
      'Quali sono le migliori alternative a {comp}?',
      'Cosa posso usare al posto del nome più grande in {cat}?',
    ],
    pricing: [
      'Quanto costa di solito {cat}?',
      'Qual è un prezzo equo per {cat} a {loc}?',
    ],
    problem: [
      'A cosa devo fare attenzione quando scelgo {cat}?',
      'Quali sono gli errori più comuni nell\'acquisto di {cat}?',
    ],
    branded: [
      'Che cos\'è {brand} e di cosa si occupa?',
      '{brand} è consigliabile? Cosa dicono le recensioni?',
    ],
  },
};

/**
 * Fill a template. Returns null when a required placeholder has no value, so a
 * prompt is never emitted with an empty slot in it.
 * @param {string} tpl
 * @param {Record<string,string|undefined>} vars
 * @returns {string|null}
 */
export function fill(tpl, vars) {
  let out = tpl;
  const needed = [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  for (const key of needed) {
    const value = vars[key];
    if (!value) return null;
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}
