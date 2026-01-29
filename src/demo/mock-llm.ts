/**
 * Agent Control Plane - Demo Mock LLM Provider
 * 
 * A deterministic mock LLM for demo purposes.
 * Simulates an agent that searches for restaurants and books one.
 */

import { LLMProvider, LLMRequest, LLMResponse } from '../core/types';

interface MockScenario {
    stepPatterns: {
        stepNum: number;
        response: string;
        action?: string;
        reasoning?: string;
        toolCall?: {
            toolName: string;
            parameters: Record<string, unknown>;
        };
        shouldContinue: boolean;
    }[];
}

/**
 * Restaurant booking scenario
 */
const RESTAURANT_SCENARIO: MockScenario = {
    stepPatterns: [
        {
            stepNum: 1,
            response: 'I need to search for Italian restaurants in the downtown area.',
            action: 'search',
            reasoning: 'The user wants to book a restaurant. First, I should search for available options.',
            toolCall: {
                toolName: 'search_restaurants',
                parameters: {
                    cuisine: 'italian',
                    location: 'downtown',
                },
            },
            shouldContinue: true,
        },
        {
            stepNum: 2,
            response: 'Found 3 Italian restaurants. Let me check availability at Bella Italia for tonight.',
            action: 'check_availability',
            reasoning: 'Bella Italia has good reviews. I should check if they have availability.',
            toolCall: {
                toolName: 'check_availability',
                parameters: {
                    restaurant: 'Bella Italia',
                    date: '2024-01-15',
                    time: '19:00',
                    party_size: 2,
                },
            },
            shouldContinue: true,
        },
        {
            stepNum: 3,
            response: 'Bella Italia has availability at 7 PM. Making the reservation.',
            action: 'book',
            reasoning: 'The restaurant has a table available. Proceeding with booking.',
            toolCall: {
                toolName: 'book_restaurant',
                parameters: {
                    restaurant: 'Bella Italia',
                    date: '2024-01-15',
                    time: '19:00',
                    party_size: 2,
                    name: 'John Doe',
                },
            },
            shouldContinue: true,
        },
        {
            stepNum: 4,
            response: 'DONE. Successfully booked a table at Bella Italia for 2 people at 7 PM on January 15th. Confirmation #12345.',
            action: 'complete',
            reasoning: 'Booking is complete. Task finished successfully.',
            shouldContinue: false,
        },
    ],
};

/**
 * Broken scenario (for testing failure detection)
 */
const BROKEN_SCENARIO: MockScenario = {
    stepPatterns: [
        {
            stepNum: 1,
            response: 'Searching for restaurants...',
            action: 'search',
            toolCall: {
                toolName: 'search_restaurants',
                parameters: { cuisine: 'italian', location: 'downtown' },
            },
            shouldContinue: true,
        },
        {
            stepNum: 2,
            response: 'Hmm, let me search again...',
            action: 'search',
            toolCall: {
                toolName: 'search_restaurants',
                parameters: { cuisine: 'italian', location: 'downtown' },
            },
            shouldContinue: true,
        },
        {
            stepNum: 3,
            response: 'Still not finding what I want, searching again...',
            action: 'search',
            toolCall: {
                toolName: 'search_restaurants',
                parameters: { cuisine: 'italian', location: 'downtown' },
            },
            shouldContinue: true,
        },
        {
            stepNum: 4,
            response: 'One more search should do it...',
            action: 'search',
            toolCall: {
                toolName: 'search_restaurants',
                parameters: { cuisine: 'italian', location: 'downtown' },
            },
            shouldContinue: true,
        },
        {
            stepNum: 5,
            response: 'Let me try a different search...',
            action: 'search',
            toolCall: {
                toolName: 'search_restaurants',
                parameters: { cuisine: 'french', location: 'downtown' },
            },
            shouldContinue: true,
        },
        {
            stepNum: 6,
            response: 'DONE. I give up, could not find a good restaurant.',
            action: 'fail',
            shouldContinue: false,
        },
    ],
};

export type ScenarioType = 'restaurant' | 'broken';

/**
 * Create a mock LLM provider with a specific scenario
 */
export function createMockLLMProvider(scenario: ScenarioType = 'restaurant'): LLMProvider {
    let currentStep = 0;
    const scenarioData = scenario === 'broken' ? BROKEN_SCENARIO : RESTAURANT_SCENARIO;

    return {
        name: 'mock-llm',
        call: async (request: LLMRequest): Promise<LLMResponse> => {
            currentStep++;

            // Find matching step pattern
            const pattern = scenarioData.stepPatterns.find(p => p.stepNum === currentStep);

            if (!pattern) {
                // Default end response
                return {
                    response: 'DONE. Task completed.',
                    shouldContinue: false,
                };
            }

            // Simulate LLM latency
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

            return {
                response: pattern.response,
                action: pattern.action,
                reasoning: pattern.reasoning,
                toolCall: pattern.toolCall,
                shouldContinue: pattern.shouldContinue,
            };
        },
    };
}

/**
 * Reset LLM state (for testing)
 */
export function resetMockLLM(): void {
    // This is handled by creating a new provider instance
}
