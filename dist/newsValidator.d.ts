export interface NewsValidation {
    blocked: boolean;
    reason: string;
    headlines: string[];
}
export declare function validateNewsRisk(ticker: string): Promise<NewsValidation>;
