import dotenv from 'dotenv';
const fs = require('fs').promises;
const path = require('path');
import { OpenAIService } from './OpenAIService.js';

// Initialize dotenv with the root directory path
dotenv.config({ path: path.join(__dirname, '../.env') });

const openaiService = new OpenAIService();

const IMAGES_DIRECTORY = path.join(__dirname, '../S01E07/maps');

async function imageProcessing() {
    try {
        const files = await fs.readdir(IMAGES_DIRECTORY);
        const jpgImages = files.filter(file => file.endsWith('.jpg')).sort();
        console.log('Found JPG images:', jpgImages);

        const processedResults = [];
        for (const imageFile of jpgImages) {
            console.log(`Processing ${imageFile}...`);
            const result = await processMapImage(imageFile);
            processedResults.push(result);
            console.log(`Processed ${imageFile}. Response:`, result.response); // Log first 100 chars
        }

        // Prepare messages for the second OpenAI call
        const systemPromptForSecondCall = {
            role: "system",
            content: `
            Twoim zadaniem jest podsumowanie wyników analizy map dostarczonych wcześniej przez inny model AI. 
            Na podstawie dostarczonych danych, zidentyfikuj, które miasta zostały poprawnie rozpoznane, 
            a które są potencjalnie błędne, nieprawdziwe, nieistniejące. 
            Nie zwracaj uwagi na sklepy, które są na mapie.
            Spróbuj znaleźć nazwy ulic i charakterystyczne obiekty dla każdego miasta.
            To miasto jest tylko w polsce.
            Nazwa miasta ma więcej niż pięć liter!
            zwróć tylko nazwy miast w formacie <city>miasto1,miasto2,miasto3...</city>
            `  
        };

        const userMessageContent = processedResults.map(result => 
            `Plik: ${result.file}\nOdpowiedź modelu: ${result.response}`
        ).join('\n\n');

        const userMessageForSecondCall = {
            role: "user",
            content: userMessageContent
        };

        console.log('Sending processed results for final summary...');
        const finalSummaryCompletion = await openaiService.completion(
            [systemPromptForSecondCall, userMessageForSecondCall],
            "gpt-4o",
            false,
            false,
            1024
        );

        console.log('Final Summary:', finalSummaryCompletion.choices[0].message.content);

        return { processedResults, finalSummary: finalSummaryCompletion.choices[0].message.content };
    } catch (error) {
        console.error('Error processing images:', error);
        throw error;
    }
}

async function processMapImage(file) {
    const filePath = path.join(IMAGES_DIRECTORY, file);
    const fileData = await fs.readFile(filePath);
    const base64Image = fileData.toString('base64');

    const messages = [
        {
            role: "system",
            content: `
            Twoim zadaniem jest analiza fragmentów mapy i określenie, z jakiego miasta pochodzą.
            Jest to miasto w Polsce! 
            Nazwa miasta ma więcej niż pięć liter!
            Uwaga: jeden z fragmentów może pochodzić z innego miasta — spróbuj go zidentyfikować jako potencjalnie błędny.

            Podczas analizy:

            Wyszukaj i podaj nazwy ulic widoczne na mapie.
            Zwróć uwagę na nazwy ulic i numery dróg (jeśli są widoczne).
            Znajdź cmentarz. 
            Poszukaj dworca przy ulicy gdzie są przystanki autobusowe.
            Poszukaj charakterystycznego obiektu na mapie, miasta.
            Nie analizuj sklepów, które są na mapie.

            Oceń układ urbanistyczny — np. siatkę ulic, zabudowę, kształt dzielnic.
            Szukaj charakterystycznych obiektów na mapie, miasta o których masz wiedzę.
            Podaj nazwie miasta z którego pochodzą mapy.
            ` },
        {
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`,
                        detail: "high"
                    }
                },
                {
                    type: "text",
                    text: "Describe this map image. Try to match the image with the city name."
                },
            ]
        }
    ];

    try {
        const chatCompletion = await openaiService.completion(messages, "gpt-4o", false, false, 1024);
        return {
            file,
            response: chatCompletion.choices[0].message.content || ''
        };
    } catch (error) {
        console.error(`Error processing image ${file}:`, error);
        throw error;
    }
}

await imageProcessing();
