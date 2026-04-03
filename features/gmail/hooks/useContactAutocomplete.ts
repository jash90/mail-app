import { useSearchContacts } from './useSearchHooks';
import { useCallback, useEffect, useState } from 'react';

export function useContactAutocomplete() {
  const [to, setTo] = useState('');
  const [toName, setToName] = useState('');
  const [debouncedTo, setDebouncedTo] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTo(to), 300);
    return () => clearTimeout(timer);
  }, [to]);

  const { data: suggestions } = useSearchContacts(debouncedTo);

  const handleToChange = useCallback((text: string) => {
    setTo(text);
    setShowSuggestions(true);
  }, []);

  const selectContact = useCallback((email: string, name: string) => {
    setTo(email);
    setToName(name);
    setShowSuggestions(false);
  }, []);

  const visibleSuggestions =
    showSuggestions && suggestions?.length ? suggestions : [];

  return {
    to,
    setTo,
    toName,
    suggestions: visibleSuggestions,
    handleToChange,
    selectContact,
  };
}
