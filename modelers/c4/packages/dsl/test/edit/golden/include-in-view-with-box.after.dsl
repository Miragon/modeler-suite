workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        mail = softwareSystem "Mail"
        customer -> shop "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include customer shop
            include mail
            properties {
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.mail" "400,280"
                "c4modeler.element.shop" "400,0"
            }
        }
    }
}
