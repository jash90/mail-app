import { apiRequest } from './api';

const PEOPLE_API_BASE = 'https://people.googleapis.com/v1';

export interface ContactResult {
  name: string;
  email: string;
}

export const searchContacts = async (
  query: string,
): Promise<ContactResult[]> => {
  const params = new URLSearchParams({
    query,
    readMask: 'names,emailAddresses',
    pageSize: '10',
  });

  const data = await apiRequest<{
    results?: Array<{
      person?: {
        names?: { displayName?: string }[];
        emailAddresses?: { value?: string }[];
      };
    }>;
  }>(`${PEOPLE_API_BASE}/people:searchContacts?${params}`);

  if (!data.results) return [];

  return data.results.flatMap((result) => {
    const person = result.person;
    if (!person?.emailAddresses?.length) return [];

    const name = person.names?.[0]?.displayName ?? '';

    return person.emailAddresses
      .filter((e) => e.value)
      .map((e) => ({
        name,
        email: e.value!,
      }));
  });
};
