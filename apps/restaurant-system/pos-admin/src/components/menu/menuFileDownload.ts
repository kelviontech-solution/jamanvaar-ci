/** Lightweight download transport, also used by the web-only QR catalogue. */
export function downloadMenuFile(name:string,body:string,type='text/csv;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([body],{type})),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
