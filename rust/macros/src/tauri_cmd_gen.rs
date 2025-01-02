use proc_macro2::TokenStream;
use quote::quote;
use syn::{parse_quote, ExprMacro};

pub fn gen_tauri_getter_impl(stream: TokenStream) -> TokenStream {
    println!("{}", stream);

    quote!(
        fn answer() -> u32 {
            69
        }
    )
}
