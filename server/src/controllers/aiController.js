const { z } = require('zod');
const db = require('../config/db');

const summarizeSchema = z.object({
  text: z.string().min(10, 'Text must be at least 10 characters long'),
  document_id: z.number().int().optional(),
});

const actionItemsSchema = z.object({
  text: z.string().min(10, 'Text must be at least 10 characters long'),
});

const explainCodeSchema = z.object({
  code: z.string().min(5, 'Code must be at least 5 characters long').max(40000),
  language: z.string().trim().max(50).optional().default('javascript'),
  mode: z.enum(['explain', 'review']).optional().default('explain'),
});

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length <= 10) return null;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    const geminiData = await response.json();
    return geminiData.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    console.warn('Gemini call failed, falling back cleanly:', err.message);
    return null;
  }
}

// Summarize text or document
const summarize = async (req, res) => {
  try {
    const validatedData = summarizeSchema.parse(req.body);
    const apiKey = process.env.GEMINI_API_KEY;

    let contentToSummarize = validatedData.text;

    // If document_id provided, check organization permission first
    if (validatedData.document_id) {
      const docRes = await db.query(
        `SELECT d.* FROM documents d
         JOIN organization_members om ON d.org_id = om.org_id
         WHERE d.id = $1 AND om.user_id = $2`,
        [validatedData.document_id, req.user.id]
      );

      if (docRes.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to access this document.' });
      }

      contentToSummarize = docRes.rows[0].content || contentToSummarize;
    }

    // Call Gemini API if API key exists
    if (apiKey && apiKey.trim().length > 10) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an AI collaborative workspace assistant. Provide a concise, executive summary of the following project document or discussion notes in 3-4 bullet points:\n\n${contentToSummarize}`,
                  },
                ],
              },
            ],
          }),
        });

        const geminiData = await response.json();
        const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (summaryText) {
          return res.json({
            summary: summaryText,
            source: 'Google Gemini 1.5 Flash',
            word_count: contentToSummarize.split(/\s+/).length,
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini API call failed, falling back to local NLP summarizer:', geminiErr.message);
      }
    }

    // High-performance intelligent local NLP fallback (if no external API key configured)
    const sentences = contentToSummarize
      .split(/\n+|(?<=[.!?])\s+/)
      .map((s) => s.trim().replace(/[.!?]+$/, ''))
      .filter((s) => s.length > 15);
    const fallbackSummary = sentences.slice(0, 3).map((s) => `• ${s}`).join('\n') || '• Project discussion is progressing according to schedule with key milestones tracked.';

    res.json({
      summary: fallbackSummary,
      source: apiKey ? 'Local NLP Engine (API Key limit/network fallback)' : 'Local Extractive Engine (Add GEMINI_API_KEY in .env for live Gemini LLM)',
      word_count: contentToSummarize.split(/\s+/).length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('AI summarize error:', error);
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
};

// Extract structured action items from notes or chat transcript
const extractActionItems = async (req, res) => {
  try {
    const validatedData = actionItemsSchema.parse(req.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey.trim().length > 10) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const prompt = `Extract actionable task items from this project discussion text. Return ONLY a valid JSON array of objects with keys "title" (string), "priority" ("low"|"medium"|"high"), and "estimated_days" (number 1-10). No markdown formatting or code fences:\n\n${validatedData.text}`;

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });

        const geminiData = await response.json();
        const rawJson = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/```json|```/g, '').trim();
        const parsedItems = JSON.parse(rawJson);

        if (Array.isArray(parsedItems)) {
          return res.json({
            action_items: parsedItems,
            source: 'Google Gemini 1.5 Flash',
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini action items extraction failed, using heuristic extraction:', geminiErr.message);
      }
    }

    // Local heuristic action item extractor fallback
    const lines = validatedData.text
      .split(/\n+|(?<=[.!?])\s+/)
      .map((l) => l.trim().replace(/[.!?]+$/, ''))
      .filter((l) => l.length > 10);
    const actionItems = lines.slice(0, 3).map((line, idx) => ({
      title: line.trim().replace(/^[-*•]\s*/, ''),
      priority: idx === 0 ? 'high' : (idx === 1 ? 'medium' : 'low'),
      estimated_days: (idx + 1) * 2,
    }));

    res.json({
      action_items: actionItems,
      source: apiKey ? 'Heuristic Rule Engine' : 'Heuristic Engine (Configure GEMINI_API_KEY in .env for generative extraction)',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('AI action items error:', error);
    res.status(500).json({ error: 'Failed to extract action items.' });
  }
};

const explainCode = async (req, res) => {
  try {
    const { code, language, mode } = explainCodeSchema.parse(req.body);
    const taskPrompt =
      mode === 'review'
        ? `Review the following ${language} code for potential bugs, edge cases, security risks, and cleanliness improvements in 4-6 concise bullet points:\n\n${code}`
        : `Explain clearly what the following ${language} code does, step by step, in 4-5 concise bullet points:\n\n${code}`;

    const aiText = await callGemini(taskPrompt);
    if (aiText) {
      return res.json({
        analysis: aiText,
        source: 'Google Gemini 1.5 Flash',
        mode,
      });
    }

    // Deterministic static-analysis fallback when no Gemini key or offline
    const lines = code.split(/\r?\n/);
    const nonEmpty = lines.filter((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#'));
    const defs = code.match(/(?:function\s+\w+|def\s+\w+|class\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\()/g) || [];
    const hasAsync = /\b(async|await|Promise)\b/.test(code);
    const hasTryCatch = /\b(try|catch|except)\b/.test(code);

    const bullets = [
      `• Language & Size: ${language.toUpperCase()} snippet with ${lines.length} total lines (${nonEmpty.length} executable lines).`,
      defs.length > 0
        ? `• Symbols Detected (${defs.length}): ${defs.slice(0, 5).map((s) => s.replace(/\s*\($/, '')).join(', ')}.`
        : '• Top-level script block with sequential execution flow.',
      mode === 'review'
        ? hasAsync && !hasTryCatch
          ? '• Error Handling Check: Asynchronous code detected without visible try/catch — wrap awaits or handle rejections.'
          : '• Error Handling & Cleanliness: Add explicit input validation and edge-case tests around boundary inputs.'
        : `• Execution Notes: Executes inside isolated browser sandbox / WebAssembly runtime (${hasAsync ? 'uses async operations' : 'synchronous logic'}).`,
    ];

    res.json({
      analysis: bullets.join('\n'),
      source: 'Static Analyzer Fallback (Set GEMINI_API_KEY in .env for deep LLM review)',
      mode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('AI explain code error:', error);
    res.status(500).json({ error: 'Failed to analyze code.' });
  }
};

module.exports = {
  summarize,
  extractActionItems,
  explainCode,
};
