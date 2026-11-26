// PostgREST caps individual responses. Always page through financial rows
// in a deterministic order so credits and older confirmations are included.
export async function purchaseQueryPages(query) {
    const pageSize = 500;
    const data = [];
    for (let from = 0; ; from += pageSize) {
        const { data: page, error } = await query.range(from, from + pageSize - 1);
        if (error) return { data: null, error };
        data.push(...page);
        if (page.length < pageSize) return { data, error: null };
    }
}
