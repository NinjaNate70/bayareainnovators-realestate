import type { FileMetadata, Result } from "../../types/backend";
export interface StorageClient {
  from(bucket:"documents"|"photos"):{
    upload(path:string,file:File|Blob,options?:{upsert?:boolean}):Promise<Result<{id:string;path:string;fullPath:string}>>;
    download(path:string):Promise<Result<Blob>>;
    remove(paths:string[]):Promise<Result<FileMetadata[]>>;
    list(prefix:string):Promise<Result<FileMetadata[]>>;
    createSignedUrl(path:string,expiresIn?:number):Promise<Result<{signedUrl:string}>>;
  };
  revokeUrls():void;
}
