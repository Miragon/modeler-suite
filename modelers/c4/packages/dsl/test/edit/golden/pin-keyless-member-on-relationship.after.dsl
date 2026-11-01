workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        mail = softwareSystem "Mail"
        customer -> shop "Uses"
        shop -> mail
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.mail" "0,296"
                "c4modeler.element.shop" "400,0"
            }
        }
    }
}
