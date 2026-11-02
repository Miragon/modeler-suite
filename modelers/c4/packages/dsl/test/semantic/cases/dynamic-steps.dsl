workspace {
    model {
        user = person "User"
        partner = element "Partner"
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        payments = softwareSystem "Payments"
        browses = user -> web "Browses" "HTTPS"
        web -> api "Calls" "JSON"
        web -> api "Streams" "gRPC"
        api -> payments "Charges"
        partner -> shop "Feeds"
    }
    views {
        dynamic shop "Checkout" {
            browses "Opens the shop"
            web -> api "Submits"
            web -> api "Streams" "gRPC"
            {
                api -> payments
            }
            {
                payments -> api "Confirms"
            }
            api -> web "Returns"
        }
        dynamic * "Landscape" {
            user -> shop "Orders"
            partner -> shop
            shop -> payments
        }
    }
}
