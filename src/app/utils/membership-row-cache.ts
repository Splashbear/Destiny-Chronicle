/** Per-account list kept between tab switches. Dropped when that account gains or loses rows. */
export class MembershipRowCache<T> {
  private readonly rows = new Map<string, T>();

  has(membershipId: string): boolean {
    return this.rows.has(membershipId);
  }

  get(membershipId: string): T | undefined {
    return this.rows.get(membershipId);
  }

  set(membershipId: string, value: T): void {
    this.rows.set(membershipId, value);
  }

  invalidate(membershipId?: string): void {
    if (!membershipId) {
      this.rows.clear();
      return;
    }
    this.rows.delete(membershipId);
  }
}
