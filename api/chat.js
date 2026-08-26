// Fonction serveur — reçoit les questions du chat et appelle Gemini de façon sécurisée.
// La clé API (GEMINI_API_KEY) reste uniquement ici, côté serveur, jamais envoyée au navigateur.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé Gemini non configurée sur le serveur.' })
  }

  const { question, context } = req.body

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question manquante.' })
  }

  // On construit un prompt qui donne à Gemini uniquement les données nécessaires
  // pour répondre — pas d'accès direct à la base de données.
  const prompt = `Tu es l'assistant du planning Avis Maroc. Tu réponds en français, de façon claire et factuelle, uniquement à partir des données ci-dessous, qui couvrent toutes les agences pour le mois en cours. Si l'information demandée n'y figure pas, dis-le clairement plutôt que d'inventer. Structure tes réponses avec des listes courtes quand c'est utile.

Données du planning (mois : ${context?.mois || 'inconnu'}) :
${JSON.stringify(context?.agences || [], null, 2)}

Question de l'utilisateur : ${question}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('Erreur Gemini:', errText)
      return res.status(502).json({ error: `Erreur Gemini (${response.status}): ${errText.slice(0, 200)}` })
    }

    const data = await response.json()
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Je n\'ai pas pu générer de réponse.'

    return res.status(200).json({ answer })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Erreur serveur.' })
  }
}
