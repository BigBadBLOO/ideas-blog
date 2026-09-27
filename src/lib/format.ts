export function formatAges(ages: readonly string[]): string {
    const numbers = ages.flatMap((age) => age.split('-').map(Number)).filter((n) => !Number.isNaN(n));
    const hasAdults = ages.includes('взрослые');
    const range = numbers.length ? `${Math.min(...numbers)}–${Math.max(...numbers)} лет` : '';

    return [range, hasAdults ? 'взрослые' : ''].filter(Boolean).join(', ');
}
