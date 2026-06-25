// Result shapes for ballot-wide search (app.ch.poltr.ballot.search).
// Each variant carries exactly the fields its overlay needs to open
// (taxonomy → ballotRkey+topic, argument → rkey, comment → uri).

type SearchResultBase = {
  title: string;
  snippet: string;
  matchField: string;
};

export type TaxonomySearchResult = SearchResultBase & {
  type: "taxonomy";
  ballotRkey: string;
  topic: string;
};

export type ArgumentSearchResult = SearchResultBase & {
  type: "argument";
  rkey: string;
  uri: string;
  argType: "PRO" | "CONTRA";
};

export type CommentSearchResult = SearchResultBase & {
  type: "comment";
  uri: string;
  argumentUri: string | null;
};

export type SearchResult =
  | TaxonomySearchResult
  | ArgumentSearchResult
  | CommentSearchResult;

export type BallotSearchResponse = {
  query: string;
  lang: string;
  results: {
    taxonomy: TaxonomySearchResult[];
    argument: ArgumentSearchResult[];
    comment: CommentSearchResult[];
  };
  counts: { taxonomy: number; argument: number; comment: number };
};
