/**
 * Agent Control Plane - Demo Mock Tools
 * 
 * Mock tools for the restaurant booking demo.
 */

import { ToolDefinition, ToolResult } from '../core/types';

/**
 * Mock restaurant data
 */
const MOCK_RESTAURANTS = [
    {
        name: 'Bella Italia',
        cuisine: 'italian',
        location: 'downtown',
        rating: 4.5,
        priceRange: '$$',
        available: true,
    },
    {
        name: 'Pasta Palace',
        cuisine: 'italian',
        location: 'downtown',
        rating: 4.2,
        priceRange: '$',
        available: true,
    },
    {
        name: 'Trattoria Roma',
        cuisine: 'italian',
        location: 'downtown',
        rating: 4.8,
        priceRange: '$$$',
        available: false,
    },
    {
        name: 'Le Petit Bistro',
        cuisine: 'french',
        location: 'downtown',
        rating: 4.6,
        priceRange: '$$$',
        available: true,
    },
];

/**
 * Search restaurants tool
 */
export const searchRestaurantsTool: ToolDefinition = {
    name: 'search_restaurants',
    description: 'Search for restaurants by cuisine and location',
    parameters: [
        { name: 'cuisine', type: 'string', description: 'Type of cuisine', required: true },
        { name: 'location', type: 'string', description: 'Location/area', required: true },
    ],
    execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        const cuisine = params.cuisine as string;
        const location = params.location as string;

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        const results = MOCK_RESTAURANTS.filter(
            r => r.cuisine.toLowerCase() === cuisine.toLowerCase() &&
                r.location.toLowerCase() === location.toLowerCase()
        );

        return {
            success: true,
            result: {
                count: results.length,
                restaurants: results.map(r => ({
                    name: r.name,
                    rating: r.rating,
                    priceRange: r.priceRange,
                })),
            },
        };
    },
};

/**
 * Check availability tool
 */
export const checkAvailabilityTool: ToolDefinition = {
    name: 'check_availability',
    description: 'Check if a restaurant has availability for a given date and time',
    parameters: [
        { name: 'restaurant', type: 'string', description: 'Restaurant name', required: true },
        { name: 'date', type: 'string', description: 'Date (YYYY-MM-DD)', required: true },
        { name: 'time', type: 'string', description: 'Time (HH:MM)', required: true },
        { name: 'party_size', type: 'number', description: 'Number of guests', required: true },
    ],
    execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        const restaurantName = params.restaurant as string;

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        const restaurant = MOCK_RESTAURANTS.find(
            r => r.name.toLowerCase() === restaurantName.toLowerCase()
        );

        if (!restaurant) {
            return {
                success: false,
                result: null,
                error: `Restaurant not found: ${restaurantName}`,
            };
        }

        return {
            success: true,
            result: {
                restaurant: restaurant.name,
                available: restaurant.available,
                date: params.date,
                time: params.time,
                party_size: params.party_size,
                alternativeTimes: restaurant.available ? [] : ['18:00', '21:00'],
            },
        };
    },
};

/**
 * Book restaurant tool
 */
export const bookRestaurantTool: ToolDefinition = {
    name: 'book_restaurant',
    description: 'Make a reservation at a restaurant',
    parameters: [
        { name: 'restaurant', type: 'string', description: 'Restaurant name', required: true },
        { name: 'date', type: 'string', description: 'Date (YYYY-MM-DD)', required: true },
        { name: 'time', type: 'string', description: 'Time (HH:MM)', required: true },
        { name: 'party_size', type: 'number', description: 'Number of guests', required: true },
        { name: 'name', type: 'string', description: 'Name for reservation', required: true },
    ],
    execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
        const restaurantName = params.restaurant as string;

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

        const restaurant = MOCK_RESTAURANTS.find(
            r => r.name.toLowerCase() === restaurantName.toLowerCase()
        );

        if (!restaurant) {
            return {
                success: false,
                result: null,
                error: `Restaurant not found: ${restaurantName}`,
            };
        }

        if (!restaurant.available) {
            return {
                success: false,
                result: null,
                error: `No availability at ${restaurantName} for the requested time`,
            };
        }

        // Generate confirmation number
        const confirmationNumber = Math.floor(10000 + Math.random() * 90000);

        return {
            success: true,
            result: {
                confirmation: `#${confirmationNumber}`,
                restaurant: restaurant.name,
                date: params.date,
                time: params.time,
                party_size: params.party_size,
                name: params.name,
                message: `Reservation confirmed at ${restaurant.name}`,
            },
        };
    },
};

/**
 * Get all demo tools
 */
export function getDemoTools(): ToolDefinition[] {
    return [
        searchRestaurantsTool,
        checkAvailabilityTool,
        bookRestaurantTool,
    ];
}
