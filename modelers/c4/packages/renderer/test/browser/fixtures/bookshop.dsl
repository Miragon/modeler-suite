workspace "Bookshop" "An online bookshop and the systems it relies on." {
    model {
        customer = person "Customer" "Buys books online."
        bookshop = softwareSystem "Bookshop" "Sells books online."
        payments = softwareSystem "Payments" "Takes card payments."
        mail = softwareSystem "Mail" "Sends e-mail."
        customer -> bookshop "Buys books"
        bookshop -> payments "Takes payments" "HTTPS"
        bookshop -> mail "Sends order e-mails"
    }
    views {
        systemLandscape "Landscape" "The bookshop and its partners." {
            include *
            exclude mail
            properties {
                "c4modeler.element.bookshop" "400,68"
                "c4modeler.element.customer" "40,40"
                "c4modeler.element.payments" "760,68"
            }
        }
        systemContext bookshop "BookshopContext" {
            include *
            properties {
                "c4modeler.element.bookshop" "400,68"
                "c4modeler.element.customer" "40,40"
                "c4modeler.element.mail" "400,400"
                "c4modeler.element.payments" "760,68"
            }
        }
    }
}
