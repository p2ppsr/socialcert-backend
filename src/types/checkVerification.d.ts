export interface DiscordData {
    userName: string;
    profilePhoto: string;
  }
  
  export interface PhoneNumberData {
    phoneNumber: string;
  }
  
  export interface EmailData {
    email: string;
  }
  
  export interface XData {
    userName: string;
    profilePhoto: string;
  }
  
  // Union of all possible types
  export type UserData = DiscordData | PhoneNumberData | EmailData | XData;
  