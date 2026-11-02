!const OWNER "orders"

workspace "Bookshop" "An online bookshop and the systems it relies on." {
    !docs docs
    !adrs decisions

    model {
        // owner: team orders
        customer = person "Customer" "Buys books online."
        bookshop = softwareSystem "Bookshop" "Sells books online." {
            web = container "Web Shop" "Takes the orders." "TypeScript"
        }
        payments = softwareSystem "Payments" "Takes card payments."
        mail = softwareSystem "Mail" "Sends e-mail for team ${OWNER}."
        customer -> web "Buys books"
        web -> payments "Takes payments" "HTTPS"
        bookshop -> mail "Sends order e-mails"

        deploymentEnvironment "Live" {
            deploymentNode "Server" {
                containerInstance web
            }
        }
    }
    views {
        systemLandscape "Landscape" "The bookshop and its partners." {
            include *
            exclude mail
            properties {
                "c4modeler.element.bookshop" "400,68"
                "c4modeler.element.customer" "40,40"
                "c4modeler.element.payments" "760,68"
                "x-vendor.owner" "team-orders"
            }
        }
        dynamic bookshop "Checkout" "The checkout steps." {
            customer -> web "Places an order"
            web -> payments "Takes the payment"
            autoLayout
        }
    }
}
