workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
        customerToShop = customer -> shop "Complains to" "E-mail"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0"
            }
        }
    }
}
