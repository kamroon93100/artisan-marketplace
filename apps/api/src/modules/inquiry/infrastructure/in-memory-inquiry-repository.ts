import type { Inquiry } from '../domain/inquiry.js';
import type {
  CreateInquiryResult,
  InquiryPage,
  InquiryRepository,
} from '../application/inquiry-repository.js';

/**
 * Total order for one buyer's inquiries, newest first.
 *
 * `id` breaks ties so the order is total. Without it, two inquiries created
 * in the same millisecond could swap between two page requests, and the
 * buyer would see one of them twice and never see the other. It mirrors the
 * catalog's published ordering, and the two must agree for a listing to
 * behave the same way everywhere.
 */
function compareInquiries(
  left: Inquiry,
  right: Inquiry,
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
}

export class InMemoryInquiryRepository
  implements InquiryRepository
{
  private readonly inquiries = new Map<string, Inquiry>();
  private readonly idempotency = new Map<string, string>();

  async create(input: {
    buyerId: string;
    productId: string;
    catalogVersion: number;
    message: string;
    idempotencyKey: string;
  }): Promise<CreateInquiryResult> {
    const key = `${input.buyerId}:${input.idempotencyKey}`;

    if (this.idempotency.has(key)) {
      return {
        inquiry: this.requireById(this.idempotency.get(key)!),
        created: false,
      };
    }

    const now = new Date().toISOString();

    const inquiry: Inquiry = {
      id: crypto.randomUUID(),
      buyerId: input.buyerId,
      productId: input.productId,
      catalogVersion: input.catalogVersion,
      message: input.message,
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
    };

    this.inquiries.set(inquiry.id, inquiry);
    this.idempotency.set(key, inquiry.id);

    return {
      inquiry,
      created: true,
    };
  }

  async findByIdempotencyKey(
    buyerId: string,
    idempotencyKey: string,
  ): Promise<Inquiry | null> {
    const id = this.idempotency.get(
      `${buyerId}:${idempotencyKey}`,
    );

    return id ? this.inquiries.get(id) ?? null : null;
  }

  /**
   * Scoped by buyer, not filtered afterwards — the same rule the database
   * read follows, so the two cannot disagree about who may read what.
   */
  async findOwnedById(
    inquiryId: string,
    buyerId: string,
  ): Promise<Inquiry | null> {
    const inquiry = this.inquiries.get(inquiryId);

    if (!inquiry || inquiry.buyerId !== buyerId) {
      return null;
    }

    return inquiry;
  }

  async listOwnedByBuyer(
    buyerId: string,
    page: { limit: number; offset: number },
  ): Promise<InquiryPage> {
    const owned = [...this.inquiries.values()]
      .filter((inquiry) => inquiry.buyerId === buyerId)
      .sort(compareInquiries);

    return {
      inquiries: owned.slice(
        page.offset,
        page.offset + page.limit,
      ),
      total: owned.length,
    };
  }

  private requireById(id: string): Inquiry {
    const inquiry = this.inquiries.get(id);

    if (!inquiry) {
      throw new Error(
        `Inquiry not found: ${id}`,
      );
    }

    return inquiry;
  }
}
