
export type Author = {
    did: string | null
    handle: string | null
    displayName?: string | null
    avatar?: string | null
    labels: unknown[]
    viewer: unknown | null
}

export type ProposalRecord = {
    $type?: string
    title?: string | null
    description?: string | null
    voteDate?: string | null
    createdAt?: string | null
    deleted?: boolean
    [k: string]: unknown
}

export type Proposal = {
    uri: string
    cid: string
    author: Author
    record: ProposalRecord
    indexedAt?: string | null
    likeCount: number
    replyCount: number
    bookmarkCount: number
    labels: unknown[]
    viewer: unknown | null
}