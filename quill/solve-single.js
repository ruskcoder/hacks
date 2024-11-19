async function hack(obj, top) {
    // Save the original fetch function
    const originalFetch = obj.fetch;

    // Extract uid and sid from URL
    const urlQueries = new URLSearchParams(location.href.split('?')[1]);
    const uid = urlQueries.get('uid') || location.hash.split('/')[location.hash.split('/').length - 1].split('?')[0];
    const sid = urlQueries.get('student');

    // Fetch session data
    let session = await originalFetch(`https://www.quill.org/api/v1/active_activity_sessions/${sid}.json`);
    if (session.status === 404) {
        // If session not found, create a new session
        const lesson = await (await originalFetch(`https://www.quill.org/api/v1/lessons/${uid}.json`)).json();
        const firstQuestion = lesson['questions'][0].key;
        let unanswered = lesson['questions'].map(e => e.key).filter(e => e !== null);
        unanswered.shift(); // Remove the first question from unanswered

        session = {
            'updatedAt': `${new Date().getTime()}`,
            'timeTracking': { "landing": 20000 },
            'currentQuestion': {
                attempts: [],
                question: firstQuestion,
            },
            'unansweredQuestions': unanswered,
            'questionSet': [...unanswered, { 'attempts': [], 'question': firstQuestion }],
            'answeredQuestions': [],
        };
    } else {
        session = await session.json();
    }

    // Fetch questions data
    const questions = await (await originalFetch(`https://www.quill.org/api/v1/activities/${uid}/questions.json`)).json();
    for (const qid of Object.keys(questions)) {
        if (session['currentQuestion']['question'] == qid) {
            const questionType = questions[qid]['question_type'];

            // Check if the question type is supported
            if (!['grammar', 'connect_fill_in_blanks', 'connect_sentence_combining'].includes(questionType)) {
                alert('This question type is not supported. Please try another question.');
                return;
            }

            // Create and display overlay
            if (!top.document.querySelector('.overlay')) {
                const overlayDiv = top.document.createElement('div');
                overlayDiv.id = 'overlay';
                overlayDiv.innerHTML = `
                <div class="overlay" style="z-index:99999">
                    <style>
                        .body { margin: none !important; padding: none !important }
                        .overlay {
                            color: white; position: absolute; background-color: rgba(0, 0, 0, 0.7);
                            width: 100vw; height: 100vh; display: flex; flex-direction: column;
                            align-items: center; justify-content: center; z-index: 9999999;
                        }
                        .ripple {
                            width: 2rem; height: 2rem; margin: 2rem; border-radius: 50%;
                            border: 0.3rem solid #ffffff; transform: translate(50%);
                            animation: 1s ripple ease-out infinite;
                        }
                        @keyframes ripple {
                            from { transform: scale(0); opacity: 1; }
                            to { transform: scale(1); opacity: 0; }
                        }
                        .multi-ripple {
                            width: 2.6rem; height: 2.6rem; margin: 2rem;
                            div {
                                position: absolute; width: 2rem; height: 2rem; border-radius: 50%;
                                border: 0.3rem solid #ffffff; animation: 1.5s ripple infinite;
                                &:nth-child(2) { animation-delay: 0.5s; }
                            }
                        }
                    </style>
                    <p style="font-size: 40px; padding: none; margin: 0px !important;">Solving Quill...</p>
                    <div class="multi-ripple"><div></div><div></div></div>
                </div>`;
                top.document.body.prepend(overlayDiv);
            }

            // Fetch correct response
            const response = await (await originalFetch(`https://cms.quill.org/questions/${qid}/responses`)).json();
            let correct = response.find(option => option.optimal == true);
            let correctAns = { ...correct, is_first_attempt: true, key: correct.id.toString(), created_at: `${new Date(correct.created_at).getTime()}` };

            // Process concept results
            let conceptIds = Object.keys(correct.concept_results);
            correct.concept_results = conceptIds.map(cid => ({ "conceptUID": cid, "correct": false }));
            correct.conceptResults = {};
            conceptIds.forEach(cid => {
                correct.conceptResults[cid] = { conceptUID: cid, correct: true };
            });
            correct.weak = false;
            delete correct.parent_id;

            // Handle different question types
            if (questionType == 'grammar') {
                correctAns.first_attempt_count = 1;
                correct.first_attempt_count = 1;
                session.currentQuestion.attempts = [correct];
            } else if (questionType == 'connect_fill_in_blanks') {
                correctAns.first_attempt_count = 1;
                correct.first_attempt_count = 0;
                correct.key = correct.id.toString();
                delete correct.parent_uid;
                delete correct.author;
                delete correct.uid;
                session.currentQuestion.attempts = [{ "response": correct }];
            } else if (questionType == 'connect_sentence_combining') {
                correct.key = correct.id.toString();
                delete correct.parent_uid;
                delete correct.uid;
                correct.concept_results = [correct.concept_results.pop()];
                session.currentQuestion.attempts = [{ "response": correct }];
            }

            // Update session time tracking
            session.timeTracking[`prompt_${session.answeredQuestions.length + 1}`] = Math.floor(Math.random() * (40000 - 10000 + 1)) + 10000;
            session = { "active_activity_session": session };

            // Send correct answer and update session
            await originalFetch('https://cms.quill.org/responses/create_or_increment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response: correctAns })
            });
            await originalFetch(`https://www.quill.org/api/v1/active_activity_sessions/${sid}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session)
            });

            // Reload the page
            obj.location.reload();
            break;
        }
    }
}

// Execute the hack function
hack(window, window);