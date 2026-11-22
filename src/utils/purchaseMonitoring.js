import { calculatePurchaseBudget } from './purchaseBudget.js';

// The purchase indicator is budget commitment, NOT physical progress, cash
// expenditure, accounting spend or material actually received.
export const summarizePurchaseOverview = (hasBudget, budgetLines = [], orderLines = []) => {
    const totals = calculatePurchaseBudget(budgetLines, orderLines);
    const percent = hasBudget && totals.initial > 0
        ? Math.round(totals.committed / totals.initial * 1000) / 10
        : null;
    return {
        ...totals,
        hasBudget: Boolean(hasBudget),
        percent,
        exceeded: percent !== null && percent > 100,
        status: !hasBudget ? 'missing_budget' : totals.initial === 0 ? 'empty_budget' : 'ready',
    };
};
