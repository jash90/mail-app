/** Parse a composite "accountId_providerId" string into its parts. */
export function parseCompositeId(id: string | undefined): {
  accountId: string;
  providerId: string;
} {
  const separatorIndex = id?.indexOf('_') ?? -1;
  return {
    accountId: separatorIndex > 0 ? id!.slice(0, separatorIndex) : '',
    providerId: separatorIndex > 0 ? id!.slice(separatorIndex + 1) : '',
  };
}
