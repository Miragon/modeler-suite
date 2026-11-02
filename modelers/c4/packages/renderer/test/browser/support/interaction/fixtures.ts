/*
 * The interaction tests' documents: valid Structurizr DSL in the canonical form the interaction
 * engine prints, so an edit changes only the lines it touches.
 */
import { newWorkspaceText } from "@miragon/c4-dsl";

/**
 * People, systems, containers and components; a pinned landscape (default view, `mail` excluded),
 * a pinned container view of `bookshop`, a dynamic view, the Database style. `api` has components,
 * so its component view is a draft; `payments` is shown in the landscape only.
 */
export const BOOKSHOP = `workspace "Bookshop" "Sells books online." {
    model {
        customer = person "Customer" "Buys books."
        bookshop = softwareSystem "Bookshop" "Sells books online." {
            web = container "Web App" "Shows the catalogue." "React"
            api = container "API" "Takes the orders." "Java" {
                orders = component "Orders" "Handles orders." "Spring"
                catalogue = component "Catalogue" "Lists the books." "Spring"
            }
            database = container "Database" "Stores the orders." "PostgreSQL" "Database"
        }
        payments = softwareSystem "Payment Provider" "Takes the payments."
        mail = softwareSystem "E-mail System" "Sends the e-mails."
        customer -> web "Buys books" "HTTPS"
        web -> api "Calls" "JSON/HTTPS"
        api -> database "Reads and writes" "JDBC"
        orders -> catalogue "Looks up books"
        bookshop -> payments "Charges cards"
        bookshop -> mail "Sends confirmations"
    }
    views {
        systemLandscape "Landscape" {
            include *
            exclude mail
            properties {
                "c4modeler.element.bookshop" "400,68"
                "c4modeler.element.customer" "40,40"
                "c4modeler.element.payments" "760,68"
            }
        }
        container bookshop "Containers" {
            include *
            properties {
                "c4modeler.element.api" "400,360"
                "c4modeler.element.customer" "40,40"
                "c4modeler.element.database" "400,640"
                "c4modeler.element.web" "400,68"
            }
        }
        dynamic bookshop "Checkout" "The checkout steps." {
            customer -> web "Buys books"
        }
        styles {
            element "Database" {
                shape cylinder
            }
        }
    }
}
`;

/** One element in a landscape: the smallest document with something to select. */
export const SINGLE = `workspace "Single" {
    model {
        customer = person "Customer"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "40,40"
            }
        }
    }
}
`;

/** What New diagram writes: no element, no view (the implicit landscape), the C4 colours. */
export const BLANK = newWorkspaceText();
