/*
 * The documents of the renderer's own view and reconcile tests (SPEC 9.4): one workspace with a
 * landscape laid out automatically, a pinned context and a pinned container view of `shop`, and
 * the drafts they reach (`Components-api`, `Containers-payments`). Kept apart from the kit's
 * fixtures, which WP9 owns.
 */

/** Views `Landscape` (default, automatic), `ShopContext` and `ShopContainers` (pinned). */
export const SHOP = `workspace "Shop" "An online bookshop." {
    model {
        customer = person "Customer" "Buys books."
        shop = softwareSystem "Shop" "Sells books online." {
            web = container "Web App" "The shop's pages." "TypeScript"
            api = container "API" "Takes orders." "Java" {
                orders = component "Orders" "Keeps the orders." "Spring"
                billing = component "Billing" "Bills the customer." "Spring"
            }
            db = container "Database" "Stores orders." "PostgreSQL" {
                tags "Database"
            }
        }
        payments = softwareSystem "Payments" "Takes the payments."
        mail = softwareSystem "Mail" "Sends e-mail."
        customer -> web "Browses"
        web -> api "Calls" "HTTPS"
        orders -> db "Reads and writes"
        billing -> payments "Charges"
        api -> mail "Sends e-mail"
    }
    views {
        systemLandscape "Landscape" {
            include *
        }
        systemContext shop "ShopContext" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.mail" "560,520"
                "c4modeler.element.payments" "40,520"
                "c4modeler.element.shop" "320,280"
            }
        }
        container shop "ShopContainers" {
            include *
            properties {
                "c4modeler.element.api" "400,320"
                "c4modeler.element.customer" "40,0"
                "c4modeler.element.db" "400,600"
                "c4modeler.element.mail" "800,320"
                "c4modeler.element.payments" "800,600"
                "c4modeler.element.web" "40,320"
            }
        }
    }
}
`;

/** The same document with another comment and indentation: a rebase, never a render. */
export const SHOP_REFORMATTED = `// Formatted by the text editor\n${SHOP.replace(/\n {8}customer = /, "\n\n        customer = ")}`;

/** Another workspace, which shares no element and no view key with `SHOP`. */
export const LIBRARY = `workspace "Library" {
    model {
        reader = person "Reader"
        library = softwareSystem "Library" {
            catalogue = container "Catalogue" "" "Kotlin"
        }
        reader -> catalogue "Searches"
    }
    views {
        container library "LibraryContainers" {
            include *
        }
    }
}
`;
