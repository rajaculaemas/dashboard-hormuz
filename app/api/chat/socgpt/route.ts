import { NextResponse } from 'next/server';
import { checkWithVirusTotal } from '@/lib/threat-intel/virustotal';
import { checkWithPhishTank } from '@/lib/threat-intel/phishtank';
import { checkWithOpenTAXII } from '@/lib/threat-intel/opentaxii';

function extractIOC(input: string): string[] {
  const iocs: string[] = [];
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const urlRegex = /https?:\/\/[\w.-]+(?:\.[\w\.-]+)+(?:[\/\w\.-]*)*/g;
  const hashRegex = /\b[a-fA-F0-9]{32,64}\b/g;

  iocs.push(...(input.match(ipRegex) || []));
  iocs.push(...(input.match(urlRegex) || []));
  iocs.push(...(input.match(hashRegex) || []));
  return iocs;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const userMessage = messages[messages.length - 1]?.content || '';
  const iocs = extractIOC(userMessage);
  let intelContext = '';

  for (const ioc of iocs) {
    if (ioc.startsWith('http')) {
      intelContext += await checkWithPhishTank(ioc) + '\n';
    }
    intelContext += await checkWithVirusTotal(ioc) + '\n';
    intelContext += await checkWithOpenTAXII(ioc) + '\n';
  }

  const systemPrompt = `
Kamu adalah SOCGPT, asisten analyst SOC yang kompeten dan responsif. Gunakan bahasa Indonesia hanya untuk kata yang menjadi respon anda, jika data yang berasal dari database atau sumber lain tidak perlu dijadikan bahasa indonesia.
Jika user memberikan indikator seperti IP, URL, atau hash, analisis data tersebut berdasarkan hasil intelijen berikut:

${intelContext.trim()}

Pastikan jawabanmu mengandung kesimpulan apakah IOC tersebut berbahaya, mencurigakan, atau aman. Sertakan bukti dan referensi jika ada.
  `.trim();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages,
      ],
    }),
  });

  const data = await response.json();
  return NextResponse.json(data);
}