use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, ItemFn};

mod tauri_cmd_gen;

#[proc_macro]
pub fn gen_tauri_getter(input: TokenStream) -> TokenStream {
    let input_struct: syn::ItemStruct = syn::parse(input.clone()).unwrap();
    tauri_cmd_gen::gen_tauri_getter_impl(syn::parse(input.clone()).unwrap()).into()
}

#[proc_macro_attribute]
pub fn trace(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let input = parse_macro_input!(item as ItemFn);
    println!("{} defined", input.sig.ident);
    println!("Args received: {}", _attr.to_string());
    TokenStream::from(quote!(#input))
}
