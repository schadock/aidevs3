import { OpenAIService } from './OpenAIService.ts';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const openaiService = new OpenAIService();
const factsPath = '../data-from-c3ntral/archive/facts';

async function processFactFiles() {
  try {
    // Get all files in the directory
    const files = await fs.readdir(factsPath);

    // Filter for .txt files and read their contents
    const textFiles = files.filter(file => file.endsWith('.txt')).sort();
    console.log('Process Fact Files: ', textFiles.length);

    const analyses = await Promise.all(
      textFiles.map(async (file) => {
        const content = await fs.readFile(path.join(factsPath, file), 'utf-8');
        console.log('fact file: ', file);
        return await analyzeFacts(content);
      })
    );

    // Save analyses to facts.json
    await fs.writeFile('facts-key-words.json', JSON.stringify(analyses, null, 2), 'utf-8');
    console.log('Analyses saved to facts-key-words.json');

    // return analyses;
  } catch (error) {
    console.error('Error loading fact files:', error);
    throw error;
  }
}

async function analyzeFacts(document) {
  try {
    const systemMessage = {
      content: `
        Twoim zadaniem jest przeanalizowanie pliku tekstowego zawierającego pojedynczy **fakt**.

        Zadanie polega na **wydobyciu kluczowych informacji** z treści faktu w **skondensowanej, uporządkowanej formie**, która będzie wykorzystana później w analizie powiązanego raportu.

        Dla każdego faktu zwróć odpowiedzi w formacie JSON, zawierającym cztery główne pola:

        {
          "osoby": [],         // Lista osób wymienionych w fakcie (imię + kluczowe informacje np. zawód, praca)
          "lokacje": [],       // Miejsca, lokalizacje, nazwy miast, budynków itp.
          "zdarzenie": "",     // Krótkie, 1-zdaniowe streszczenie najważniejszego zdarzenia
          "obiekty": []        // Przedmioty, urządzenia, technologie, istotne elementy fizyczne
        }

        Uwagi:
        - Jeśli któreś z pól nie występuje w danym fakcie, zwróć pustą listę lub pusty string.
        - Nie dopisuj żadnych wyjaśnień ani komentarzy poza strukturą JSON.
        - Nie twórz dodatkowych pól — tylko te cztery.
        - W polu "zdarzenie" postaraj się krótko streścić **co się stało**, **komu**, **gdzie**, jeśli to możliwe.

        Przykład (dla faktu o tym, że Jan Kowalski został zauważony przy stacji z podejrzanym urządzeniem):

        <result>
        {
          "osoby": ["Jan Kowalski - <kluczowe informacje np. zawód>"],
          "lokacje": ["stacja kolejowa Zachodnia"],
          "zdarzenie": "Jan Kowalski został zauważony przy podejrzanym urządzeniu na stacji",
          "obiekty": ["urządzenie", "detektor ruchu"]
        }
        </result>
      `,
      role: 'system'
    };

    const userMessage = {
      role: 'user',
      content: document
    };

    const response = await openaiService.completion({
      messages: [systemMessage, userMessage],
      model: 'gpt-4.1-nano',
      stream: false
    });

    return JSON.parse(response.choices[0].message.content || '{}');

  } catch (error) {
    console.error('Error analyzing document:', error);
    throw error;
  }
}

async function sumarizeFacts() {
  try {
    const factsData = await fs.readFile('facts-key-words.json', 'utf-8');
    const factsSummary = JSON.parse(factsData);

    const systemMessage = {
      role: 'system',
      content: `
          Twoje zadanie:
          1. **Przejrzyj wszystkie streszczenia.**
          2. **Znajdź powtarzające się motywy, osoby, lokalizacje, zdarzenia lub przedmioty.**
          3. **Zgrupuj podobne streszczenia i połącz je logicznie.**
        - Nie dodawaj informacji spoza inputu.
        - Nie używaj tagów ani formatowania markdown.
        Zwróć **jeden połączony objekt**, bez komentarzy i bez żadnych znaczników.

        <result> { "osoby": [], "lokacje": [], "zdarzenia": "", "obiekty": [] } </result>
      `
    };

    const userMessage = {
      role: 'user',
      content: [
        {
          type: "text",
          text: JSON.stringify(factsSummary)
        }
      ]
    };

    const response = await openaiService.completion({
      messages: [systemMessage, userMessage],
      model: 'gpt-4.1-nano',
      stream: false
    });

    const result = response.choices[0].message.content || '';
    console.log('Result:', result);

    // Save result to facts-summary.txt
    await fs.writeFile('facts-summary.txt', result, 'utf-8');
    console.log('Result saved to facts-summary.txt');

  } catch (error) {
    console.error('Error loading facts summary:', error);
    throw error;
  }
}

async function processReport(report) {
  try {

    // Read facts from facts-summary.txt
    const factsSummary = await fs.readFile('facts-summary.txt', 'utf-8');

    const systemMessage = {
      role: 'system',
      content:  `
        Twoim zadaniem jest przeanalizować pojedynczy plik z raportem tekstowym (format TXT). Dla każdego raportu wykonaj następujące kroki:

        1. Przeczytaj dokładnie treść raportu i zidentyfikuj:
          - co się wydarzyło,
          - gdzie to się wydarzyło,
          - kto był zaangażowany,
          - jaką funkcję, zawód, rolę lub pozycję pełniła każda z wymienionych osób,
          - jakie urządzenia, technologie, obiekty lub zjawiska zostały opisane.

        2. Użyj dodatkowych informacji przekazanych w sekcji <fakty>:
        <fakty>
        ${factsSummary}
        </fakty>
          - Traktuj je jako **obowiązkowe źródło wiedzy pomocniczej**.
          - Dla każdej osoby wymienionej w raporcie, **sprawdź dokładnie czy występuje w faktach** – i jeśli tak, obowiązkowo użyj tych informacji. np: "Andrzej Ragowski - nauczyciel" - słowa kluczowe: "andrzej ragowski", nauczyciel"
          - jeśli osoba jest programistą dodaj: programista i język programowania np: "programista Java"
          - Uwzględnij także inne powiązania (lokacje, wydarzenia, technologie, obiekty).
          - Bądź wyrozumiały wobec literówek – np. "Kowaski" i "Kowalki" mogą oznaczać tę samą osobę.
          - staraj się dodać słowa kluczowe dla każej z kategorii <fakty>: "osoby", "lokacje", "zdarzenia", "obiekty".

        3. Z nazwy pliku raportu znajdź i wyciągnij sektor, dodaj jako słowo kluczowe

        4. Wygeneruj **listę słów kluczowych** precyzyjnie opisujących raport:
          - Słowa muszą być w **języku polskim**, w **mianowniku** (np. "inżynier", nie "inżyniera").
          - Oddziel słowa przecinkami, bez spacji (np. słowo1,słowo2,słowo3).
          - Nie ograniczaj liczby słów — dobierz ich tyle, ile potrzeba, aby trafnie oddać treść raportu.
          - Uwzględnij fakty, zawód osób, lokalizacje, obiekty i wszystkie inne istotne informacje. Dodaj je jako słowa kluczowe.

        5. Pamiętaj o dokładności:
          - Jeśli pojawia się osoba – **zidentyfikuj jej zawód, funkcję, miejsce pracy lub rolę** z faktów.
          - Jeśli pojawiają się technologie lub obiekty – nazwij je precyzyjnie.
          - Jeśli miejsce lub wydarzenie – również nazwij je dokładnie.

        6. Nie twórz żadnych nowych kategorii. Jeśli dany raport nie zawiera wystarczających informacji – nie generuj sztucznych słów.

        7. Twój cel: **precyzyjna, kompletna, konkretna lista słów kluczowych**.

        Zanim podasz końcowy wynik – **myśl na głos**. Wypisz, co udało Ci się znaleźć. Przeanalizuj logiczne powiązania między raportem, faktami i nazwą pliku. Dopiero na końcu wypisz listę słów kluczowych w tym formacie:

        <RESULT>
        słowo1,słowo2,słowo3,...
        </RESULT>
      `
    };

    const userMessage = {
      role: 'user',
      content: `fileName: ${report.fileName} \n report: ${report.document}`
    };

    const response = await openaiService.completion({
      messages: [systemMessage, userMessage],
      // model: 'gpt-4.1-nano',
      model: 'gpt-4.1',
      stream: false
    });

    const analysisResult = response.choices[0].message.content || '';
    // console.log('Report result:', analysisResult);

    // Extract content between <RESULT> tags
    const resultMatch = analysisResult.match(/<RESULT>\s*([\s\S]*?)\s*<\/RESULT>/);
    const extractedResult = resultMatch ? resultMatch[1].trim() : '';
    console.log('Extracted keywords:', extractedResult);
    return extractedResult;
  } catch (error) {
    console.error('Error analyzing document:', error);
    throw error;
  }
}

async function analyzeReports() {
  try {
    console.log('Analyze Reports...');
    const reportsPath = '../data-from-c3ntral/archive';

    // Get all files in the directory
    const files = await fs.readdir(reportsPath);

    // Only txt files
    const reportFiles = files.filter(file => file.endsWith('.txt')).sort() // .slice(0, 1);
    console.log('Report Files: ', reportFiles.length);

    const reportKeywords = await Promise.all(
      reportFiles.map(async (fileName) => {

        try {
          const content = await fs.readFile(path.join(reportsPath, fileName), 'utf-8');
          console.log('report file: ', fileName);
          const analysis = await processReport({ fileName, document: content });
          return {
            fileName,
            analysis
          };
        } catch (error) {
          console.error(`Error processing report ${fileName}:`, error);
          return null;
        }
      })
    );
    console.log('reportKeywords: ',  reportKeywords);

    // Save analyses to results.json
    await fs.writeFile('results.json', JSON.stringify(reportKeywords, null, 2), 'utf-8');
    console.log('Analyses saved to results.json');

    return reportKeywords;
  } catch (error) {
    console.error('Error processing reports:', error);
    throw error;
  }
}

async function sendReport(taskType, anwser) {
  // Prepare the payload
  const payload = {
    task: taskType,
    apikey: process.env.CENTRALA_KEY,
    answer: anwser
  };

  // Send to the API
  const response = await fetch('https://c3ntrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();
  console.log('Response:', responseData);

  if (responseData.code === 0 && responseData.message) {
    const match = responseData.message.match(/FLG:{{FLG:(.*?)}}/);
    if (match && match[1]) {
      console.log('Extracted FLG value:', match[1]);
    }
  }
}

async function parseResult() {
  try {
    // Read the results.json file
    const resultsData = await fs.readFile('results.json', 'utf-8');
    const results = JSON.parse(resultsData);

    // Format the results as requested
    const formattedResults = results.reduce((acc, result) => {
      acc[result.fileName] = result.analysis;
      return acc;
    }, {});

    return formattedResults;
  } catch (error) {
    console.error('Error parsing results:', error);
    throw error;
  }
}

// await processFactFiles();
// await sumarizeFacts();
await analyzeReports();
const results = await parseResult();
await sendReport('dokumenty', results);