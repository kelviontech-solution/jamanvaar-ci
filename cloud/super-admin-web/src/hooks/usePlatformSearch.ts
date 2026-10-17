import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { SearchResult } from '../api/types';

export function usePlatformSearch(query: string) {
  const [searchResults,setSearchResults]=useState<SearchResult|null>(null),[searching,setSearching]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{
    const request=++generation.current;
    let active=true;
    const value=query.trim();
    setSearchResults(null);setSearching(value.length>=2);
    if(value.length<2)return;
    const timer=setTimeout(()=>{
      void api.get<SearchResult>(`/api/v1/support/search?q=${encodeURIComponent(value)}`)
        .then(result=>{if(active&&request===generation.current)setSearchResults(result);})
        .catch(()=>{if(active&&request===generation.current)setSearchResults(null);})
        .finally(()=>{if(active&&request===generation.current)setSearching(false);});
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[query]);
  return {searchResults,searching};
}
