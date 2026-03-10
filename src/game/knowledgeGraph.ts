export type Triple = { subject: string; predicate: string; object: string };

export class KnowledgeGraph {
  triples: Triple[] = [];

  add(subject: string, predicate: string, object: string) {
    if (!this.has(subject, predicate, object)) {
      this.triples.push({ subject, predicate, object });
    }
  }

  set(subject: string, predicate: string, object: string) {
    // Remove all existing triples with the same subject and predicate
    this.triples = this.triples.filter(
      (t) => !(t.subject === subject && t.predicate === predicate),
    );
    this.triples.push({ subject, predicate, object });
  }

  has(subject: string, predicate: string, object: string) {
    return this.triples.some(
      (t) =>
        t.subject === subject &&
        t.predicate === predicate &&
        t.object === object,
    );
  }

  query(subject?: string, predicate?: string, object?: string): Triple[] {
    return this.triples.filter(
      (t) =>
        (!subject || t.subject === subject) &&
        (!predicate || t.predicate === predicate) &&
        (!object || t.object === object),
    );
  }

  remove(subject: string, predicate: string, object: string) {
    this.triples = this.triples.filter(
      (t) =>
        !(
          t.subject === subject &&
          t.predicate === predicate &&
          t.object === object
        ),
    );
  }
}
