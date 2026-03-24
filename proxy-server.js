const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * Proxy endpoint for Moxfield and Archidekt APIs
 * Usage: GET /api/deck?source=moxfield&id={deckId}
 *        or GET /api/deck?source=moxfield&username={username}&slug={slug}
 *        or GET /api/deck?source=archidekt&id={deckId}
 */
app.get('/api/deck', async (req, res) => {
	try {
		const { source, id, username, slug } = req.query;

		if (!source) {
			return res.status(400).json({ error: 'Missing source parameter (moxfield or archidekt)' });
		}

		let apiUrl;

		if (source === 'moxfield') {
			if (!id) {
				return res.status(400).json({
					error: 'Missing Moxfield deck id. Use a Moxfield URL that includes /decks/{id}.'
				});
			}
		} else if (source === 'archidekt') {
			if (!id) {
				return res.status(400).json({ error: 'Missing Archidekt deck id.' });
			}
			apiUrl = `https://archidekt.com/api/decks/${id}/?format=json`;
		} else {
			return res.status(400).json({ error: 'Invalid source. Use moxfield or archidekt.' });
		}

		// Add proper headers to avoid being blocked
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'Accept': 'application/json',
			'Origin': source === 'moxfield' ? 'https://www.moxfield.com' : 'https://archidekt.com',
			'Referer': source === 'moxfield' ? 'https://moxfield.com/' : 'https://archidekt.com/',
			'Accept-Language': 'en-US,en;q=0.9'
		};

		if (source === 'moxfield') {
			const proxxiedUrl = `https://api.proxxied.com/api/moxfield/decks/${id}`;
			console.log(`Fetching Proxxied Moxfield payload: ${proxxiedUrl}`);

			try {
				const proxxiedResponse = await fetch(proxxiedUrl, {
					headers: {
						'User-Agent': headers['User-Agent'],
						'Accept': 'application/json',
					},
				});

				if (!proxxiedResponse.ok) {
					const proxxiedErrorText = await proxxiedResponse.text();
					return res.status(proxxiedResponse.status).json({
						error: 'Failed to fetch from moxfield',
						status: proxxiedResponse.status,
						details: proxxiedErrorText.slice(0, 240) || proxxiedResponse.statusText,
					});
				}

				const proxxiedData = await proxxiedResponse.json();
				return res.json(proxxiedData);
			} catch (error) {
				return res.status(502).json({
					error: 'Failed to fetch from moxfield',
					status: 502,
					details: String(error),
				});
			}
		}

		console.log(`Fetching: ${apiUrl}`);

		const response = await fetch(apiUrl, { headers });

		if (!response.ok) {
			console.error(`API returned ${response.status}: ${response.statusText}`);
			return res.status(response.status).json({
				error: `Failed to fetch from ${source}`,
				status: response.status,
				details: response.statusText
			});
		}

		const data = await response.json();
		res.json(data);
	} catch (error) {
		console.error('Proxy error:', error);
		res.status(500).json({ error: 'Internal server error', details: String(error) });
	}
});

app.listen(PORT, () => {
	console.log(`✓ MTG Helper Proxy server running on http://localhost:${PORT}`);
	console.log(`\nAvailable endpoints:`);
	console.log(`  GET /api/deck?source=moxfield&id={deckId}`);
	console.log(`  GET /api/deck?source=archidekt&id={deckId}\n`);
});


